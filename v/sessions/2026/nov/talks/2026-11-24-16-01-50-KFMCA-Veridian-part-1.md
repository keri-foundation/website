AI generated summary.

Jaime Caso, Innovation Engineer at Veridian, demos wallet recovery that replaces the seed phrase with biometric smart cards. In the Veridian wallet every key still derives from a bran, shown to the user as a seed phrase, but that phrase is easy to lose or steal. The design separates daily signing keys on the phone from rotation power held offline on cards.

For the demo, rotation is a threshold one-of-two multisig: either of two fingerprint-backed cards can rotate the controller. One card might stay at home and the other with a custodian. Jaime backups a populated Samsung wallet onto a gray factory card and a black HID card, then recovers the same profiles, credentials, connections, and notifications onto a fresh iPhone with a single tap. The old phone’s keys rotate out and the Samsung shows that the wallet moved, so the lost device can no longer act as controller.

The cards store a 32-byte master seed and a rotation index in the secure element, not raw keys, which never leave the chip. Hierarchical derivation from that seed avoids issuing a new card on every rotation while still keeping the high-risk material off the phone. Q&A with Samuel Smith covers why HDKM on external hardware cuts seed-entry attack surface without forcing a new card per rotation.
