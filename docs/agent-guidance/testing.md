# Testing

Unit tests should cover pure logic:

- page classification scoring;
- section boundary detection;
- parts-list row parsing;
- Rebrickable matching normalization;
- optional CSV comparison;
- step callout reconciliation;
- bag allocation;
- validation status calculation.

Playwright tests should cover the main workflow:

- upload a PDF;
- detect sections;
- review extracted inventory;
- match catalog images;
- upload optional CSV validation data;
- generate bags;
- adjust bag boundaries;
- export bag lists.

Privacy tests should verify:

- PDF bytes are not written to browser storage;
- manual page renderings are not persisted;
- service worker cache excludes uploaded PDFs;
- no network request sends PDF content.
