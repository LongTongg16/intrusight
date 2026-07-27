# GeoLite2 City setup

IntruSight can enrich public source and destination IP addresses with approximate
location data. Enrichment is optional; the API still runs when the database is
absent.

## Install

1. Create a MaxMind account and generate a download license key.
2. Download the GeoLite2 City database in MMDB format.
3. Extract `GeoLite2-City.mmdb` to `backend/geoip/GeoLite2-City.mmdb`, or keep
   it in another private location.
4. If using another location, set this in `backend/.env`:

   ```dotenv
   GEOIP_DB_PATH=/absolute/private/path/GeoLite2-City.mmdb
   ```

The database file and MaxMind credentials are ignored by Git and must not be
committed. MaxMind recommends its `geoipupdate` program for automated updates:

- [GeoLite database documentation](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/)
- [Database update guidance](https://dev.maxmind.com/geoip/updating-databases/)
- [GeoLite end-user license](https://www.maxmind.com/en/geolite/eula)

GeoLite users must keep databases current and remove old releases as required by
the current license. Review those terms directly rather than relying on this
project for legal advice.

## Behavior

- Public IPv4 and IPv6 addresses may receive country, region, city, coordinates,
  time zone, and accuracy-radius fields.
- Private, invalid, and unknown addresses are left unenriched.
- Coordinates represent an approximate area and must not be used to identify a
  household, individual, or street address.
- Kismet records use MAC addresses in the normalized source/destination fields,
  so they are not eligible for IP geolocation.

Authenticated users can refresh an alert after installing a newer database:

```bash
curl -X POST http://localhost:8000/api/alerts/ALERT_ID/refresh-location \
  -H "Authorization: Bearer <user-jwt>"
```

Use `POST /api/alerts/refresh-all-locations` to refresh all stored alerts. This
operation can be expensive on a large collection.

## Troubleshooting

- Confirm the process can read the MMDB file.
- Resolve a relative `GEOIP_DB_PATH` from the directory where Uvicorn starts.
- Restart the API after replacing an already opened database.
- Missing location data for private or unknown IP space is expected.
