### Ran Playwright code
```js
await page.goto('https://example.org');
```
### Open tabs
- 0: (current) [Example Domain](https://example.org/)
- 1: [Modal Demo](data:text/html,%3C!doctype%20html%3E%3Chtml%20lang%3D'en'%3E%3Chead%3E%3Cmeta%20charset%3D'utf-8'%3E%3Ctitle%3EModal%20Demo%3C/title%3E%3Cstyle%3Ebody%7Bfont-family%3Asans-serif%3Bmargin%3A24px%3B%7D%23modal%7Bposition%3Afixed%3Btop%3A20%25%3Bleft%3A20%25%3Bpadding%3A16px%3Bbackground%3Awhite%3Bborder%3A1px%20solid%20%23999%3Bbox-shadow%3A0%208px%2024px%20rgba(0%2C0%2C0%2C.2)%3Bdisplay%3Anone%3B%7D%23backdrop%7Bposition%3Afixed%3Binset%3A0%3Bbackground%3Argba(0%2C0%2C0%2C.3)%3Bdisplay%3Anone%3B%7D%23modal.open%2C%23backdrop.open%7Bdisplay%3Ablock%3B%7D%3C/style%3E%3Cscript%3Efunction%20openModal()%7Bdocument.getElementById('modal').classList.add('open')%3Bdocument.getElementById('backdrop').classList.add('open')%3Bdocument.getElementById('status').textContent%3D'Modal%20open'%3B%7D%3C/script%3E%3C/head%3E%3Cbody%3E%3Ch1%3EModal%20Demo%3C/h1%3E%3Cp%20id%3D'status'%3EReady%3C/p%3E%3Cbutton%20id%3D'open'%20onclick%3D'openModal()'%3EOpen%20modal%3C/button%3E%3Cdiv%20id%3D'backdrop'%20aria-hidden%3D'true'%3E%3C/div%3E%3Cdiv%20id%3D'modal'%20role%3D'dialog'%20aria-modal%3D'true'%20aria-label%3D'Filters'%3E%3Cstrong%3EFilters%3C/strong%3E%3Cp%3EApply%20filters%20before%20continuing.%3C/p%3E%3Cbutton%3EClose%3C/button%3E%3C/div%3E%3C/body%3E%3C/html%3E)
- 2: [](about:blank)
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
```yaml
- generic [ref=e2]:
  - heading "Example Domain" [level=1] [ref=e3]
  - paragraph [ref=e4]: This domain is for use in documentation examples without needing permission. Avoid use in operations.
  - paragraph [ref=e5]:
    - link "Learn more" [ref=e6] [cursor=pointer]:
      - /url: https://iana.org/domains/example
```
