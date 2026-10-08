# Reports PnL Graph – Back-end API Specification

This document describes what the **Reports** page needs from the back-end to show the **PnL (Profit and Loss) graph** for the following time ranges:

- **Week** – last 7 days (daily data)
- **Month** – last 30 days (daily data)
- **6M** – last 6 months (monthly data)
- **Year** – last 12 months (monthly data)
- **All** – from first activity to now (monthly data)

---

## Recommended: Single endpoint with `period` query

**Endpoint:** `GET /api/reports/{user_id}`  
**Authentication:** Bearer token (e.g. Laravel Sanctum)  
**Query parameter:**

| Parameter | Type   | Required | Values | Description |
|-----------|--------|----------|--------|-------------|
| `period`  | string | No       | `week`, `month`, `6months`, `year`, `all` | Time range for the graph. If omitted, backend can default to `month` or return all periods (see alternative below). |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "labels": ["2025-01-22", "2025-01-23", "..."],
    "pnl_series": [100.50, -20.25, 150.00, "..."],
    "balance_series": [10000.00, 10080.25, "..."],
    "summary": {
      "total_pnl": 1234.56,
      "today": 50.00,
      "week": 200.00,
      "month": 500.00,
      "six_months": 1200.00,
      "year": 2500.00
    }
  }
}
```

---

## Response fields (per period)

### 1. `period` (string)

- Echo of the requested `period`: `week` | `month` | `6months` | `year` | `all`.

### 2. `labels` (array of strings)

- One label per point for the X-axis. Front-end will use them as-is or format for display.
- **Week:** 7 values, e.g. `["2025-02-14", "2025-02-15", ..., "2025-02-20"]` or `["Fri 14", "Sat 15", ...]`.
- **Month:** 30 values (last 30 days), e.g. `["2025-01-22", ..., "2025-02-20"]`.
- **6months:** 6 values, e.g. `["2024-09", "2024-10", ..., "2025-02"]` or month names.
- **Year:** 12 values, e.g. `["2024-03", "2024-04", ..., "2025-02"]`.
- **All:** From first month with data to current month, e.g. `["2024-01", "2024-02", ...]`.

### 3. `pnl_series` (array of numbers)

- PnL for each point (same length as `labels`).
- **Week:** 7 daily PnL values (e.g. euros), oldest to newest.
- **Month:** 30 daily PnL values.
- **6months:** 6 monthly PnL values.
- **Year:** 12 monthly PnL values.
- **All:** One value per month from first activity to current month.

### 4. `balance_series` (array of numbers, optional)

- Balance at each point (same length as `labels`). Optional; if not provided, front-end can derive a cumulative line from `pnl_series` if needed.

### 5. `summary` (object)

- **total_pnl** (number): Total PnL for the **selected period** (e.g. sum of the series or your existing logic).
- **today** (number): PnL for today.
- **week** (number): PnL for the last 7 days.
- **month** (number): PnL for the last 30 days / current month (align with your existing definition).
- **six_months** (number): PnL for the last 6 months.
- **year** (number): PnL for the last 12 months.

Front-end uses these for the period selector and any summary cards; the graph itself uses `labels` + `pnl_series` (and optionally `balance_series`).

---

## Example requests

```http
GET /api/reports/123?period=week
Authorization: Bearer {token}
Accept: application/json
```

```http
GET /api/reports/123?period=month
GET /api/reports/123?period=6months
GET /api/reports/123?period=year
GET /api/reports/123?period=all
```

---

## Error / no data

- **401:** Unauthorized (invalid or missing token).
- **403:** User not allowed to see this report.
- **404:** User or report not found.

When the user has no trading data for the requested period, return `success: true` with empty or zero data, for example:

```json
{
  "success": true,
  "data": {
    "period": "week",
    "labels": [],
    "pnl_series": [],
    "balance_series": [],
    "summary": {
      "total_pnl": 0,
      "today": 0,
      "week": 0,
      "month": 0,
      "six_months": 0,
      "year": 0
    }
  }
}
```

---

## Alternative: Backend returns all periods in one call

If you prefer a single response without a `period` query:

**Endpoint:** `GET /api/reports/{user_id}` (no query param)

**Response:**

```json
{
  "success": true,
  "data": {
    "week": {
      "labels": ["..."],
      "pnl_series": [],
      "balance_series": []
    },
    "month": { "labels": [], "pnl_series": [], "balance_series": [] },
    "6months": { "labels": [], "pnl_series": [], "balance_series": [] },
    "year": { "labels": [], "pnl_series": [], "balance_series": [] },
    "all": { "labels": [], "pnl_series": [], "balance_series": [] },
    "summary": {
      "total_pnl": 0,
      "today": 0,
      "week": 0,
      "month": 0,
      "six_months": 0,
      "year": 0
    }
  }
}
```

Front-end would then pick `data[selectedPeriod]` and `data.summary`. This avoids extra requests but increases payload size.

---

## Summary for back-end developer

| Need | Description |
|------|-------------|
| **Endpoint** | `GET /api/reports/{user_id}` with optional `?period=week|month|6months|year|all`. |
| **Auth** | Bearer token. |
| **Week** | 7 daily PnL values + 7 labels (last 7 days). |
| **Month** | 30 daily PnL values + 30 labels (last 30 days). |
| **6M** | 6 monthly PnL values + 6 labels (last 6 months). |
| **Year** | 12 monthly PnL values + 12 labels (last 12 months). |
| **All** | Monthly PnL from first activity to current month + same length labels. |
| **Summary** | `total_pnl` for the period plus `today`, `week`, `month`, `six_months`, `year` for UI. |

Front-end will use `labels` for the X-axis and `pnl_series` for the PnL line; no need to send pre-formatted chart labels (e.g. "Jan", "Feb") unless you want to—date strings are fine and can be formatted on the client.
