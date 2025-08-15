@echo off
set "ddns_url=magnificent.hopto.org"
REM Κάνει resolve το DDNS URL σε IP
for /f "tokens=2 delims=[]" %%A in ('ping -n 1 %ddns_url% ^| find "["') do set ip=%%A
echo Βρέθηκε IP: %ip%
REM Άνοιγμα στον default browser
start http://%ip%
pause
