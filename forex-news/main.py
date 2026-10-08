import cloudscraper
from bs4 import BeautifulSoup
import pandas as pd

url = "https://www.forexfactory.com/calendar?week=this"

scraper = cloudscraper.create_scraper()  # Bypasses Cloudflare
response = scraper.get(url)

if response.status_code == 200:
    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.find('table', class_='calendar__table')
    
    if table:
        rows = table.find_all('tr', class_='calendar__row')
        data = []
        
        current_date = ''  # Track the current date
        for row in rows:
            date_cell = row.find('td', class_='calendar__date')
            if date_cell and date_cell.text.strip():  # If this row has a date
                current_date = date_cell.text.strip()  # Update current date
            date = current_date  # Use the current date for this row
            time = row.find('td', class_='calendar__time').text.strip() if row.find('td', class_='calendar__time') else ''
            currency = row.find('td', class_='calendar__currency').text.strip() if row.find('td', class_='calendar__currency') else ''
            # Extract impact from CSS class
            impact_span = row.find('td', class_='calendar__impact').find('span') if row.find('td', class_='calendar__impact') else None
            if impact_span and impact_span.get('class'):
                classes = impact_span.get('class')
                if 'icon--ff-impact-ora' in classes:
                    impact = 'Medium'
                elif 'icon--ff-impact-gra' in classes:
                    impact = 'Non-Economic'
                elif 'icon--ff-impact-yel' in classes:
                    impact = 'Low'
                elif 'icon--ff-impact-red' in classes:
                    impact = 'High'
                else:
                    impact = ''
            else:
                impact = ''
            event = row.find('td', class_='calendar__event').text.strip() if row.find('td', class_='calendar__event') else ''
            actual = row.find('td', class_='calendar__actual').text.strip() if row.find('td', class_='calendar__actual') else ''
            forecast = row.find('td', class_='calendar__forecast').text.strip() if row.find('td', class_='calendar__forecast') else ''
            previous = row.find('td', class_='calendar__previous').text.strip() if row.find('td', class_='calendar__previous') else ''
            
            # Only add row if it has meaningful data (not all empty)
            if any([time, currency, impact, event, actual, forecast, previous]):
                data.append([date, time, currency, impact, event, actual, forecast, previous])
        
        df = pd.DataFrame(data, columns=['Date', 'Time', 'Currency', 'Impact', 'Event', 'Actual', 'Forecast', 'Previous'])
        print(df)
        df.to_csv('forex_calendar.csv', index=False)
    else:
        print("Table not found.")
else:
    print(f"Failed to fetch: {response.status_code}")