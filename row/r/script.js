function updateBands() {
    const numberOfBands = parseInt(document.getElementById('bands').value);

    document.querySelectorAll('.band-container').forEach(container => {
        container.style.display = 'none';
    });

    document.getElementById('band1-container').style.display = 'block';
    document.getElementById('band2-container').style.display = 'block';

    if (numberOfBands >= 5) {
        document.getElementById('band3-container').style.display = 'block';
    }

    document.getElementById('multiplier-container').style.display = 'block';
    document.getElementById('tolerance-container').style.display = 'block';

    if (numberOfBands === 6) {
        document.getElementById('temp-coefficient-container').style.display = 'block';
    }
}

function calculateResistance() {
    const numberOfBands = parseInt(document.getElementById('bands').value);
    const band1 = parseInt(document.getElementById('band1').value);
    const band2 = parseInt(document.getElementById('band2').value);
    let resistanceValue;
    let toleranceValue;
    let tempCoefficientValue;

    if (numberOfBands === 4) {
        const multiplier = parseFloat(document.getElementById('multiplier').value);
        const tolerance = parseFloat(document.getElementById('tolerance').value);
        resistanceValue = ((band1 * 10) + band2) * multiplier;
        toleranceValue = tolerance;
    } else if (numberOfBands === 5) {
        const band3 = parseInt(document.getElementById('band3').value);
        const multiplier = parseFloat(document.getElementById('multiplier').value);
        const tolerance = parseFloat(document.getElementById('tolerance').value);
        resistanceValue = ((band1 * 100) + (band2 * 10) + band3) * multiplier;
        toleranceValue = tolerance;
    } else if (numberOfBands === 6) {
        const band3 = parseInt(document.getElementById('band3').value);
        const multiplier = parseFloat(document.getElementById('multiplier').value);
        const tolerance = parseFloat(document.getElementById('tolerance').value);
        const tempCoefficient = parseFloat(document.getElementById('temp-coefficient').value);
        resistanceValue = ((band1 * 100) + (band2 * 10) + band3) * multiplier;
        toleranceValue = tolerance;
        tempCoefficientValue = tempCoefficient;
    }

    let resultText = `Αντίσταση: ${resistanceValue} Ω`;

    if (toleranceValue) {
        const toleranceRange = resistanceValue * (toleranceValue / 100);
        resultText += `, Ανοχή: ±${toleranceValue}% (${(resistanceValue - toleranceRange).toFixed(2)} Ω έως ${(resistanceValue + toleranceRange).toFixed(2)} Ω)`;
    }

    if (numberOfBands === 6) {
        resultText += `, Συντελεστής Θερμοκρασίας: ${tempCoefficientValue} ppm/°C`;
    }

    document.getElementById('result').innerText = resultText;
}

document.addEventListener("DOMContentLoaded", updateBands);
