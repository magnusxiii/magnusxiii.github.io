@echo off
chcp 65001  > nul
setlocal enabledelayedexpansion

:: Ζητάμε από τον χρήστη να εισάγει την IP διεύθυνση
set /p target_ip=Παρακαλώ εισάγετε την IP διεύθυνση της συσκευής: 

:: Δημιουργία ονόματος αρχείου με βάση την IP
set output_file=%target_ip%.txt

:: Εκτέλεση του ping για 20 δευτερόλεπτα
echo Εκτέλεση ping στην IP %target_ip% για 20 δευτερόλεπτα...
echo.

:: Αρχικοποίηση μετρητών
set sent=0
set received=0
set lost=0
set total_ms=0

:: Αποθήκευση της τρέχουσας ημερομηνίας και ώρας
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
    set current_date=%%a/%%b/%%c
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set current_time=%%a:%%b
)

:: Καθαρισμός ARP cache και προετοιμασία για εύρεση MAC
ping -n 1 %target_ip% > nul

:: Εκτέλεση ping για 20 δευτερόλεπτα
for /L %%i in (1,1,20) do (
    set /a sent+=1
    ping -n 1 -w 1000 %target_ip% > ping_temp.txt
    
    findstr /C:"Reply from" ping_temp.txt > nul
    if !errorlevel! equ 0 (
        set /a received+=1
        
        :: Εξαγωγή του χρόνου απόκρισης (ms)
        for /f "tokens=4 delims==" %%t in ('findstr /C:"time" ping_temp.txt') do (
            set ms_str=%%t
            set ms_str=!ms_str:~1!
            set ms_str=!ms_str:ms=!
            set ms_str=!ms_str: =!
            
            :: Έλεγχος αν είναι αριθμός
            set "num=!ms_str!"
            set "invalid="
            for /f "delims=0123456789." %%a in ("!num!") do set "invalid=%%a"
            
            if "!invalid!"=="" (
                if not "!ms_str!"=="" (
                    set /a total_ms+=!ms_str!
                )
            )
        )
    ) else (
        set /a lost+=1
    )
    
    timeout /t 1 > nul
)

:: Υπολογισμός του μέσου όρου ms
set avg_ms=0
if !received! GTR 0 (
    set /a avg_ms=total_ms/received
)

:: Εύρεση MAC διεύθυνσης
set mac_address=Δεν βρέθηκε

:: Προσπάθεια εύρεσης MAC μέσω ARP
ping -n 1 %target_ip% > nul
for /f "skip=3 tokens=1-3" %%a in ('arp -a %target_ip%') do (
    if "%%a"=="%target_ip%" (
        set mac_address=%%b
    )
)

:: Καθαρισμός του mac_address αν είναι "dynamic"
if "!mac_address!"=="dynamic" (
    set mac_address=Δεν βρέθηκε
)

:: Δημιουργία του αρχείου εξόδου
echo Ημερομηνία: %current_date% %current_time% > %output_file%
echo Αποτελέσματα ping για την IP: %target_ip% >> %output_file%
echo Πακέτα που στάλθηκαν: %sent% >> %output_file%
echo Πακέτα που ελήφθησαν επιτυχώς: %received% >> %output_file%
echo Πακέτα που χάθηκαν: %lost% >> %output_file%
echo Μέσος όρος χρόνου απόκρισης: %avg_ms% ms >> %output_file%
echo MAC διεύθυνση: %mac_address% >> %output_file%

:: Καθαρισμός προσωρινών αρχείων
del ping_temp.txt > nul 2>&1

echo.
echo Η διαδικασία ολοκληρώθηκε! Τα αποτελέσματα αποθηκεύτηκαν στο αρχείο %output_file%
echo.

endlocal
pause
