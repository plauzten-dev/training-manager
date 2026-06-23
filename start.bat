@echo off
title TrainDesk
color 0A
echo.
echo  =====================================
echo   TrainDesk - Wird gestartet...
echo  =====================================
echo.
echo  Installiere Abhaengigkeiten...
python -m pip install flask -q
echo  Starte Server...
echo.
echo  Oeffne http://localhost:5000 im Browser
echo  Beenden: Ctrl+C druecken
echo.
python app.py
pause
