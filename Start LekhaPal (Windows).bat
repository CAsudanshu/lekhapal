@echo off
title LekhaPal - Accounting by CA Sudanshu Mallick
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
