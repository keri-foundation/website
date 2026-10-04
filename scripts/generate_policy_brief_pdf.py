from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "KERI-Policy-Brief.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4

NAVY = colors.HexColor("#0E1B2B")
BLUE = colors.HexColor("#1F5AA6")
TEAL = colors.HexColor("#0F8B8D")
GOLD = colors.HexColor("#D9A441")
SLATE = colors.HexColor("#44546A")
MUTED = colors.HexColor("#6B778C")
LIGHT = colors.HexColor("#F4F7FB")
LIGHT_BLUE = colors.HexColor("#EAF2FF")
LIGHT_TEAL = colors.HexColor("#E9F8F8")
LIGHT_GOLD = colors.HexColor("#FFF5E4")
RED = colors.HexColor("#B64946")
GREEN = colors.HexColor("#2E7D32")
WHITE = colors.white


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="BodyPolicy",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.4,
            leading=14.2,
            textColor=NAVY,
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallPolicy",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.8,
            leading=11.5,
            textColor=MUTED,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubheadPolicy",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15,
            textColor=BLUE,
            spaceBefore=2,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            textColor=WHITE,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverSubtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=16,
            textColor=WHITE,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CalloutTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15,
            textColor=WHITE,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CalloutBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.2,
            leading=13.2,
            textColor=WHITE,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CenterNote",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11.3,
            leading=14,
            textColor=BLUE,
            alignment=TA_CENTER,
        )
    )

    return styles


class BulletParagraph(Flowable):
    def __init__(self, text: str, style: ParagraphStyle, bullet_color=BLUE):
        super().__init__()
        self.text = text
        self.style = style
        self.bullet_color = bullet_color
        self._para = Paragraph(text, style)
        self.width = 0
        self.height = 0

    def wrap(self, avail_width, avail_height):
        bullet_space = 14
        w, h = self._para.wrap(avail_width - bullet_space, avail_height)
        self.width = avail_width
        self.height = h
        self._inner_width = w
        return avail_width, h

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(self.bullet_color)
        c.circle(4, self.height - 7, 2.4, stroke=0, fill=1)
        c.restoreState()
        self._para.drawOn(c, 12, 0)


class CalloutBox(Flowable):
    def __init__(self, title: str, body: str, fill=BLUE):
        super().__init__()
        self.title = title
        self.body = body
        self.fill = fill
        self.styles = build_styles()
        self.title_p = Paragraph(title, self.styles["CalloutTitle"])
        self.body_p = Paragraph(body, self.styles["CalloutBody"])
        self.height = 0

    def wrap(self, avail_width, avail_height):
        inner = avail_width - 26
        _, h1 = self.title_p.wrap(inner, avail_height)
        _, h2 = self.body_p.wrap(inner, avail_height)
        self.width = avail_width
        self.height = h1 + h2 + 26
        return avail_width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(self.fill)
        c.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=0)
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.12))
        c.circle(self.width - 28, self.height - 22, 18, fill=1, stroke=0)
        c.circle(self.width - 12, self.height - 34, 12, fill=1, stroke=0)
        c.restoreState()
        self.title_p.drawOn(c, 13, self.height - 22 - self.title_p.height)
        self.body_p.drawOn(c, 13, 11)


class ComparisonGraphic(Flowable):
    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 178
        return self.width, self.height

    def draw_panel(self, x, y, w, h, title, bullets, bg, accent):
        c = self.canv
        c.setFillColor(bg)
        c.roundRect(x, y, w, h, 12, fill=1, stroke=0)
        c.setStrokeColor(accent)
        c.setLineWidth(2)
        c.roundRect(x, y, w, h, 12, fill=0, stroke=1)
        c.setFillColor(accent)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x + 14, y + h - 20, title)
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 9.2)
        line_y = y + h - 38
        for bullet in bullets:
            c.setFillColor(accent)
            c.circle(x + 18, line_y + 3, 2.3, fill=1, stroke=0)
            c.setFillColor(NAVY)
            text = c.beginText(x + 28, line_y)
            text.setFont("Helvetica", 9.2)
            for segment in bullet.split("\n"):
                text.textLine(segment)
                line_y -= 11
            c.drawText(text)
            line_y -= 5

    def draw(self):
        gap = 16
        w = (self.width - gap) / 2
        self.draw_panel(
            0,
            0,
            w,
            self.height,
            "Default Path: Surveillance Identity",
            [
                "Security improves by collecting\nmore behavioral data",
                "Centralized intermediaries see\nmore of each transaction",
                "Larger breach blast radius and\nmore dependency on a few systems",
                "Higher risk of identity revocation\nbecoming a practical kill switch",
            ],
            LIGHT_GOLD,
            RED,
        )
        self.draw_panel(
            w + gap,
            0,
            w,
            self.height,
            "KERI Path: Privacy-Preserving Trust",
            [
                "Keys at the edge: users and\norganizations control their identifiers",
                "Selective disclosure and reduced\ncross-context correlation",
                "Witnesses and watchers support\navailability and verification",
                "Government can endorse identity\nwithout owning every interaction",
            ],
            LIGHT_TEAL,
            GREEN,
        )


class TimelineGraphic(Flowable):
    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 138
        return self.width, self.height

    def draw_step(self, x, y, r, title, subtitle, color):
        c = self.canv
        c.setFillColor(color)
        c.circle(x, y, r, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(x, y + 2, title)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawCentredString(x, y - 28, subtitle)

    def draw(self):
        c = self.canv
        c.setStrokeColor(BLUE)
        c.setLineWidth(3)
        line_y = self.height - 48
        c.line(55, line_y, self.width - 55, line_y)
        steps = [
            ("Now", "Policy choice window", TEAL),
            ("2027", "CMS deadlines apply", BLUE),
            ("Next", "Cross-sector scale-up", GOLD),
        ]
        xs = [70, self.width / 2, self.width - 70]
        for x, (title, subtitle, color) in zip(xs, steps):
            self.draw_step(x, line_y, 14, title, subtitle, color)

        c.setFillColor(NAVY)
        c.setFont("Helvetica", 9.2)
        c.drawString(10, 16, "Policy implication: the question is not whether digital identity arrives, but which architecture gets normalized.")


class ActionGrid(Flowable):
    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 232
        return self.width, self.height

    def draw_card(self, x, y, w, h, number, title, body, color):
        c = self.canv
        c.setFillColor(WHITE)
        c.roundRect(x, y, w, h, 10, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor("#D8E1EF"))
        c.roundRect(x, y, w, h, 10, fill=0, stroke=1)
        c.setFillColor(color)
        c.circle(x + 18, y + h - 18, 10, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(x + 18, y + h - 21, str(number))
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(x + 34, y + h - 21, title)
        text = c.beginText(x + 14, y + h - 40)
        text.setFont("Helvetica", 8.9)
        text.setFillColor(SLATE)
        for line in body.split("\n"):
            text.textLine(line)
        c.drawText(text)

    def draw(self):
        gap = 12
        w = (self.width - gap) / 2
        h = 104
        cards = [
            (
                1,
                "Define the model",
                "Set clear policy principles:\nindividual control, no kill switch,\nopen wallets, selective disclosure.",
                BLUE,
            ),
            (
                2,
                "Use existing mandates",
                "Attach KERI-compatible trust\nrequirements to current sectors,\nstarting with healthcare and directories.",
                TEAL,
            ),
            (
                3,
                "Build legal foundations",
                "Clarify endorsement, verifier\nduties, liability, and interstate\nrecognition of credentials.",
                GOLD,
            ),
            (
                4,
                "Fund open infrastructure",
                "Support witness, watcher, and\nwallet ecosystems rather than\nsingle-vendor identity silos.",
                GREEN,
            ),
        ]
        positions = [
            (0, h + gap),
            (w + gap, h + gap),
            (0, 0),
            (w + gap, 0),
        ]
        for card, pos in zip(cards, positions):
            self.draw_card(pos[0], pos[1], w, h, *card)


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.05))
    canvas.circle(4.7 * cm, 23.5 * cm, 5.2 * cm, stroke=0, fill=1)
    canvas.circle(16.5 * cm, 20.2 * cm, 3.7 * cm, stroke=0, fill=1)
    canvas.circle(12.2 * cm, 6.0 * cm, 4.1 * cm, stroke=0, fill=1)

    canvas.setStrokeColor(colors.Color(1, 1, 1, alpha=0.13))
    canvas.setLineWidth(1.4)
    canvas.line(2.5 * cm, 8.4 * cm, 18 * cm, 20.4 * cm)
    canvas.line(3.6 * cm, 7.4 * cm, 18.7 * cm, 7.4 * cm)
    canvas.line(15.5 * cm, 4.6 * cm, 16.9 * cm, 19.4 * cm)

    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 26)
    canvas.drawCentredString(PAGE_WIDTH / 2, 18.7 * cm, "Why Policymakers Should")
    canvas.drawCentredString(PAGE_WIDTH / 2, 17.5 * cm, "Start Adopting KERI Now")

    canvas.setFont("Helvetica", 12)
    canvas.drawCentredString(
        PAGE_WIDTH / 2,
        15.8 * cm,
        "A policy brief based on KERI Conference 2026 and Utah SEDI summit materials",
    )

    canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.12))
    canvas.roundRect(3.0 * cm, 10.2 * cm, 15.0 * cm, 3.0 * cm, 10, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawCentredString(PAGE_WIDTH / 2, 12.0 * cm, "Core proposition")
    canvas.setFont("Helvetica", 11)
    canvas.drawCentredString(
        PAGE_WIDTH / 2,
        11.1 * cm,
        "KERI offers security-first digital identity without forcing governments or citizens",
    )
    canvas.drawCentredString(
        PAGE_WIDTH / 2,
        10.5 * cm,
        "into centralized, AI-surveilled identity infrastructure.",
    )

    canvas.setFont("Helvetica", 9.5)
    canvas.drawCentredString(PAGE_WIDTH / 2, 2.0 * cm, "Prepared for policy and institutional decision-makers")
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(WHITE)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
    canvas.setStrokeColor(colors.HexColor("#D6E0EC"))
    canvas.line(1.9 * cm, 1.6 * cm, PAGE_WIDTH - 1.9 * cm, 1.6 * cm)
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(2.0 * cm, 1.05 * cm, "KERI policy brief")
    canvas.drawRightString(PAGE_WIDTH - 2.0 * cm, 1.05 * cm, str(doc.page))
    canvas.restoreState()


def story(styles):
    items = []

    items.append(NextPageTemplate("body"))
    items.append(PageBreak())

    items.append(Paragraph("Executive Summary", styles["SectionTitle"]))
    items.append(
        Paragraph(
            "Digital identity is no longer a distant policy topic. It is being shaped now by market platforms, public-sector modernization, and regulatory mandates. The core strategic question is whether policymakers will allow digital identity to evolve into a centralized surveillance layer, or whether they will steer it toward a model that preserves security, privacy, accountability, and democratic legitimacy.",
            styles["BodyPolicy"],
        )
    )
    items.append(
        Paragraph(
            "KERI, or Key Event Receipt Infrastructure, is repeatedly presented across the subtitle materials as the most credible near-term path to that second outcome. It supports individually controlled identifiers, selective disclosure, verifiable credentials, resilience against centralized failure, and a government role based on endorsement rather than constant mediation.",
            styles["BodyPolicy"],
        )
    )
    items.append(Spacer(1, 6))
    items.append(
        CalloutBox(
            "Bottom line for policymakers",
            "The practical choice is no longer between digital identity and no digital identity. It is between privacy-preserving trust infrastructure and identity systems that become increasingly dependent on behavioral tracking, central intermediaries, and revocation power.",
            fill=BLUE,
        )
    )
    items.append(Spacer(1, 14))

    items.append(Paragraph("Why the policy window is now", styles["SectionTitle"]))
    items.append(TimelineGraphic())
    items.append(Spacer(1, 10))
    items.append(
        Paragraph(
            "The source materials make clear that the adoption window is time-bound. Healthcare interoperability mandates are already creating deadlines, while AI-driven security pressures are pushing institutions toward architectures that rely on ever more data collection. If policymakers do not define the rules of the road now, the market will normalize a different default.",
            styles["BodyPolicy"],
        )
    )
    items.append(BulletParagraph("Digital identity is arriving regardless of whether governments design a coherent strategy.", styles["BodyPolicy"]))
    items.append(BulletParagraph("Regulatory mechanisms already exist to accelerate adoption where trust infrastructure is missing.", styles["BodyPolicy"]))
    items.append(BulletParagraph("AI-scale attack pressure increases the temptation to trade privacy away for security theater.", styles["BodyPolicy"]))

    items.append(Spacer(1, 10))
    items.append(Paragraph("Two diverging paths", styles["SectionTitle"]))
    items.append(ComparisonGraphic())
    items.append(Spacer(1, 10))
    items.append(
        Paragraph(
            "Samuel Smith’s surveillance warning and Utah’s SEDI policy framing converge on the same issue: if security is rebuilt around continuous behavioral correlation, digital identity becomes inseparable from monitoring. KERI is attractive precisely because it aims to strengthen security without making surveillance the operating model.",
            styles["BodyPolicy"],
        )
    )

    items.append(Paragraph("Why KERI fits policy goals", styles["SectionTitle"]))
    items.append(BulletParagraph("It keeps keys and control at the edge, reducing dependence on always-present third-party identity providers.", styles["BodyPolicy"]))
    items.append(BulletParagraph("It supports selective disclosure, allowing people to prove what is necessary without over-sharing full identity records.", styles["BodyPolicy"]))
    items.append(BulletParagraph("It reduces cross-context correlation, helping avoid the emergence of a single behaviorally tracked identity graph.", styles["BodyPolicy"]))
    items.append(BulletParagraph("It enables verification through witnesses and watchers, which supports transparency, availability, and resistance to centralized failure.", styles["BodyPolicy"]))
    items.append(BulletParagraph("It lets government endorse identity for legal purposes without creating a standing surveillance intermediary.", styles["BodyPolicy"]))

    items.append(Spacer(1, 8))
    items.append(
        CalloutBox(
            "The SEDI principle",
            "Identity should be yours. The state may endorse it for legal purposes, but it should not create a dependency where a citizen’s ability to function in society depends on a central identity switch.",
            fill=TEAL,
        )
    )

    items.append(PageBreak())
    items.append(Paragraph("Near-term public value", styles["SectionTitle"]))
    items.append(Paragraph("The brief is especially compelling for high-consequence sectors where trust, privacy, and interoperability all matter at once.", styles["BodyPolicy"]))
    items.append(Paragraph("Healthcare", styles["SubheadPolicy"]))
    items.append(
        Paragraph(
            "The conference materials on FHIR, CMS, and healthcare interoperability argue that the missing layer is trusted authorization and provenance between entities, providers, payers, and eventually patients. KERI-compatible infrastructure can support this without expanding the current ecosystem of brittle shared secrets and centralized directories.",
            styles["BodyPolicy"],
        )
    )
    items.append(Paragraph("State-endorsed digital identity", styles["SubheadPolicy"]))
    items.append(
        Paragraph(
            "Utah’s SEDI framing stresses constitutional rights, non-surveillance, open wallet choice, and the avoidance of cross-context monitoring. KERI aligns well because it lets policy define legal endorsement while the technical architecture preserves private control and context separation.",
            styles["BodyPolicy"],
        )
    )
    items.append(Paragraph("Cross-sector trust services", styles["SubheadPolicy"]))
    items.append(
        Paragraph(
            "Once organizational identity and personal identity can be verified without central lock-in, policymakers can support safer public-private workflows across licensing, benefits, regulated marketplaces, and evidence-heavy transactions.",
            styles["BodyPolicy"],
        )
    )

    items.append(Spacer(1, 8))
    items.append(Paragraph("What makes adoption credible now", styles["SectionTitle"]))
    items.append(
        Paragraph(
            "The materials do not describe KERI as an abstract future concept. They describe an ecosystem with open-source implementations, operational infrastructure concepts, and real adoption pathways. Witnesses, watchers, wallets, and verifier-facing tooling are already concrete enough to support pilots and standards-aligned deployment.",
            styles["BodyPolicy"],
        )
    )
    items.append(BulletParagraph("Technical foundations are described as largely in place.", styles["BodyPolicy"]))
    items.append(BulletParagraph("Open-source implementation reduces procurement and transparency risk.", styles["BodyPolicy"]))
    items.append(BulletParagraph("Existing mandates, especially in healthcare, create a realistic adoption wedge.", styles["BodyPolicy"]))
    items.append(BulletParagraph("The policy case is strengthened by growing concern about AI-enabled cyber risk.", styles["BodyPolicy"]))

    items.append(Spacer(1, 8))
    items.append(Paragraph("Recommended policy actions", styles["SectionTitle"]))
    items.append(ActionGrid())

    items.append(Spacer(1, 10))
    items.append(
        Paragraph(
            "These actions do not require policymakers to bet on a speculative national identity reboot. They can be pursued incrementally by setting principles, shaping procurement, attaching trust requirements to active mandates, and funding open infrastructure that keeps future options open.",
            styles["BodyPolicy"],
        )
    )

    items.append(Paragraph("Conclusion", styles["SectionTitle"]))
    items.append(
        Paragraph(
            "The consistent message across the conference and summit subtitle materials is that digital identity is becoming foundational infrastructure. Policymakers still have an opportunity to shape that infrastructure around accountable privacy, resilient security, and lawful endorsement rather than centralized surveillance. KERI is compelling because it offers a practical way to do that in the near term, not merely in theory.",
            styles["BodyPolicy"],
        )
    )
    items.append(
        Paragraph(
            "In policy terms, adopting KERI now is less about choosing a product than choosing an architecture: one that limits concentration of power, reduces data over-collection, supports open ecosystems, and prepares institutions for the next wave of AI-driven security pressure.",
            styles["BodyPolicy"],
        )
    )
    items.append(Spacer(1, 8))
    items.append(Paragraph("Source basis", styles["SubheadPolicy"]))
    items.append(
        Paragraph(
            "This brief is based on subtitle materials from the KERI Conference 2026 corpus and the Utah State-Endorsed Digital Identity summit sessions in this repository, including talks by Samuel Smith, George McEwan, Phil Windley, Jared Jefferey, Phil Feairheller, Thomas Mayfield, Nicholas Racz, and summit panel participants.",
            styles["SmallPolicy"],
        )
    )

    return items


def build_pdf():
    styles = build_styles()
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=2.1 * cm,
        rightMargin=2.1 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.2 * cm,
        title="KERI Policy Brief",
        author="Cursor",
    )

    cover_frame = Frame(1.5 * cm, 1.5 * cm, PAGE_WIDTH - 3 * cm, PAGE_HEIGHT - 3 * cm, id="cover")
    body_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
            PageTemplate(id="body", frames=[body_frame], onPage=body_page),
        ]
    )

    doc.build(story(styles))


if __name__ == "__main__":
    build_pdf()
    print(f"Created {OUTPUT}")
