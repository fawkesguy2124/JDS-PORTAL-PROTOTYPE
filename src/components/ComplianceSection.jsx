import { Panel, EmptyState, Button } from '../industrial/ui'
import '../industrial/styles/records.css'

// BIS & Licences. The portal has no certificate register yet (no table holds BIS,
// LMPC or licence numbers and expiry dates), so this shows the register's columns
// and says plainly that nothing is tracked. The four sample rows and the
// "2 certificates expiring" banner that were here were made up, and are gone
// (real data only, Jose 31 Oct 2026). The page title comes from AdminDashboard.
// No count tiles while nothing is recorded: three "—" tiles only repeated the empty
// register (Jose, 31 Oct 2026). Bring them back with the register.

const COLS = ['Client', 'Type', 'Number', 'Product / scope', 'Expires', 'Status']

export default function ComplianceSection({ showToast }) {
  const add = () => showToast?.('Coming soon', 'info')
  return (
    <>
      <Panel title="Certificate register" meta="BIS, LMPC and licences, with their expiry dates"
        className="rec-panel" actions={<Button size="sm" icon="plus" onClick={add}>Add certificate</Button>}>
        <div className="ix-tbl-wrap">
          <table className="ix-tbl rec-tbl">
            <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              <tr className="rec-more">
                <td colSpan={COLS.length}>
                  <EmptyState line icon="certificate" title="No certificates recorded yet." />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
