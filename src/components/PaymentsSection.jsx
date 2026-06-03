import PaymentsMobile from './mobile/PaymentsMobile'
import PaymentsDesktop from './desktop/PaymentsDesktop'

function PaymentsSection({ jobs, profiles, showToast }) {
  return (
    <div>
      <div className="block md:hidden">
        <PaymentsMobile jobs={jobs} showToast={showToast} />
      </div>
      <div className="hidden md:block">
        <PaymentsDesktop jobs={jobs} profiles={profiles} showToast={showToast} />
      </div>
    </div>
  )
}

export default PaymentsSection
