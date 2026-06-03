import ComplianceMobile from './mobile/ComplianceMobile'
import ComplianceDesktop from './desktop/ComplianceDesktop'

function ComplianceSection({ showToast }) {
  return (
    <div>
      <div className="block md:hidden">
        <ComplianceMobile showToast={showToast} />
      </div>
      <div className="hidden md:block">
        <ComplianceDesktop showToast={showToast} />
      </div>
    </div>
  )
}

export default ComplianceSection
