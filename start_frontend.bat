@echo off
title Colab AI - ChatGPT Frontend
cd /d "%~dp0frontend"
echo ========================================================
echo       Starting Colab AI Frontend (Vite + React)...
echo ========================================================
echo.
echo Opening http://localhost:5173 ...
npm run dev
pause
