from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "django-insecure-ud^@3w&465c-ysxihdob1_x*0nq$te(0t7a33ct1do66l3j)i!"

# SECURITY WARNING: define the correct hosts in production!
ALLOWED_HOSTS = ["*"]

WAGTAILADMIN_BASE_URL = "http://127.0.0.1:8000"

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"


try:
    from .local import *
except ImportError:
    pass
