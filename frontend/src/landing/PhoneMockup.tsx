// A drawing of the real Count screen, built from HTML so it stays sharp at any
// size and costs no image download. The figures are example data.

const ROWS = [
  { name: 'Sugar 1kg', expected: 20, counted: 18, unit: 'bags' },
  { name: 'Rice 5kg', expected: 12, counted: 12, unit: 'bags' },
  { name: 'Inyange milk 500ml', expected: 48, counted: 48, unit: 'packs' },
]

export function PhoneMockup() {
  return (
    <figure className="mock" aria-label="Example of the StockWise stock count screen on a phone">
      <div className="mock__phone" aria-hidden="true">
        <div className="mock__bar">
          <span className="mock__sub">Kimironko Mini Market</span>
          <span className="mock__title">Stock count · Tue 24 Nov</span>
        </div>
        <div className="mock__body">
          <div className="mock__progress">
            <strong>3 of 4 counted, 1 with a difference</strong>
            <span className="mock__track">
              <span style={{ width: '75%' }} />
            </span>
          </div>
          {ROWS.map((row) => {
            const diff = row.counted - row.expected
            return (
              <div key={row.name} className="mock__row">
                <div className="mock__info">
                  <strong>{row.name}</strong>
                  <span className="mock__muted">
                    Expected: {row.expected} {row.unit}
                  </span>
                  {diff === 0 ? (
                    <span className="mock__ok">Matches</span>
                  ) : (
                    <>
                      <span className="mock__bad">Shortage of {Math.abs(diff)}</span>
                      <span className="mock__link">Investigate now</span>
                    </>
                  )}
                </div>
                <span className="mock__box">{row.counted}</span>
              </div>
            )
          })}
          <div className="mock__row">
            <div className="mock__info">
              <strong>Cooking oil 1L</strong>
              <span className="mock__muted">Not counted yet</span>
            </div>
            <span className="mock__box mock__box--empty" />
          </div>
        </div>
        <div className="mock__nav">
          {['Products', 'Movements', 'Count', 'Issues', 'Reports'].map((tab) => (
            <span key={tab} className={tab === 'Count' ? 'mock__tab mock__tab--on' : 'mock__tab'}>
              <span className="mock__dot" />
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="mock__report" aria-hidden="true">
        <span className="mock__report-kicker">Loan-readiness report</span>
        <dl>
          <div>
            <dt>Stock value</dt>
            <dd>1,284,500 RWF</dd>
          </div>
          <div>
            <dt>Count accuracy</dt>
            <dd>92.0%</dd>
          </div>
          <div>
            <dt>Issues resolved</dt>
            <dd>11 of 12</dd>
          </div>
        </dl>
      </div>
      <figcaption className="mock__caption">Example data</figcaption>
    </figure>
  )
}
