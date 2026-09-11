@echo off
chcp 65001 > nul
title Rust Telegram Monitor
python main.py
if errorlevel 1 (
    echo.
    echo Bot stopped with an error.
)
pause