# GPS timeout status and recovery

A browser geolocation timeout is different from a Firebase upload failure. Explicit fresh-location requests already retry on the next one-second scheduler tick after completion/error, with at most one pending native request. The fix preserves that behavior and the ten-second native request timeout.

Previously the driver page used one message for every error, never cleared GPS timeout text on a subsequent valid reading, and always labelled GPS Connected. Recoverable GPS errors now have separate available/waiting status. The waiting notice says automatic retries continue, while reports retain the last acknowledged location and its actual capture time. Only a newly accepted fix clears waiting; duplicate/older callbacks do not. Network/authorization errors are not cleared by a GPS callback.

Watch callbacks and explicit requests can finish out of order. A timeout received within one second of a newly accepted fix is ignored, but location-permission denial is never suppressed. Permission denial stops GPS collection and reporting and shows a terminal failure with Stop Tracking still available for session cleanup. Firebase authorization failures use the same terminal presentation. Status updates use a polite live region. No layout redesign, onboarding, rules or schema changes.

Verification: 86 app tests plus 31 transition/security and 7 rules emulator tests passed (124 total). Both production and staging builds passed with the existing map bundle-size warning. New tests cover timeout, automatic retry, duplicate rejection, fresh-fix recovery, late watcher errors, immediate permission revocation and no traffic after terminal failure/Stop.

Scope: deploy public/driver staging Hosting only. No production, admin Hosting, cloud backend, driver assignment, history or audit mutation. The phone's GPS acquisition delay remains a physical-device acceptance item; this does not claim that a browser can guarantee a fresh measurement each second.
