# Front-End

Angular standalone UI for `trades` landing page:
- north: stock ticker carousel
- west: subsection filters
- center: setup content cards

## Run with backend

1. Start Kotlin Micronaut backend from `backend`:
   - Windows PowerShell: `./gradlew.bat run`
2. Start Angular app from `front-end`:
   - `npm install`
   - `npm start`
3. Open `http://localhost:4200`.

The app expects backend API at `http://localhost:8080` and calls:
- `/api/v1/health`
- `/api/v1/stocks`
- `/api/v1/setups`

## Build and test

- `npm run build`
- `npm test`
