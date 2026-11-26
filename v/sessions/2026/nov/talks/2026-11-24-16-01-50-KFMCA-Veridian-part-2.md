AI generated summary, if a statement needs explication, see the video.

Roberto C. Morano, Lead DevRel Advocate at Veridian, shows a bridge that treats KERI ACDCs as an OpenID Connect identity provider. Ideal apps would speak KERI natively; until they do, his proxy verifies credentials against KERI infrastructure and emits OIDC tokens that ordinary web apps already understand.

He walks an organization manager that invites users, issues role credentials, and protects demo apps behind an OAuth proxy: an org-wide app that accepts any credential from that issuer, plus Department 0 (ACME) and Department 1 (Veridian) apps that require the matching credential. After OOBI connection and issuance into the Veridian wallet, presentation unlocks the right apps; revocation drops access on the next check even while other credentials still work. Once set up, sessions behave like single sign-on until TTL expiry or revoke.

He argues this supercharges OpenID rather than replacing it: Google or other OIDC logins can be backed by KERI credentials, including multisig profiles whose rotation keys sit on smart cards, so social and workspace access inherit stronger key control without rewriting every relying party.
