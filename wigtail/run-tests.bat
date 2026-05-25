@echo off
REM Non-interactive Django tests (avoids prompt when test_wagtail already exists).
python manage.py test --noinput %*
