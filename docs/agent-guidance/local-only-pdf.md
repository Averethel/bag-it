# Local-Only PDF Rules

Manual PDFs may be copyrighted. Process them locally in the browser.

Hard requirements:

- Never upload manual PDF bytes to an application server.
- Never send manual page images, crops, or rendered pages to external services.
- Never store PDFs in IndexedDB, localStorage, Cache Storage, or server storage.
- Never persist rendered manual pages or cropped manual images.
- Keep PDF bytes and page renderings in memory for the active session only.
- Ensure the PWA service worker does not cache user-uploaded manuals.
- Require the user to reselect the PDF when reopening a project.

Allowed persisted data:

- Rebrickable catalog data.
- Normalized part metadata.
- Generated bag lists.
- Validation reports.
- User review decisions.

Persisted data must not contain manual page imagery or redistributed manual
content.
