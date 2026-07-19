import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const colors = {
  ink: '#121212',
  paper: '#FAFAFA',
  mist: '#F0F0EE',
  line: '#DCDCDA',
  graphite: '#5A5A57',
  stamp: '#0B0B0B',
  white: '#FFFFFF',
};

const vendors = [
  'Vedor 1',
  'Vendor 2',
  'Vendor 3',
  'Vendor 4',
  'Vendor 5',
  'Vendor 6',
  'Vendor 7',
  'Vendor 8',
  'Any email vendor',
];

const features = [
  ['Vendor mail intake', 'Bring every order email into one system, even when each vendor uses a different format.'],
  ['Structured dashboard', 'See vendor, train, item, quantity, customer and delivery details without opening raw emails.'],
  ['Fast order search', 'Look up records by vendor, date, train number, item or status in seconds.'],
  ['Review flags', 'Catch duplicates, missing fields and unknown formats before they become end-of-day cleanup.'],
  ['Clean exports', 'Download order records by vendor or date range for reporting, audits and accounting.'],
  ['No vendor setup', 'No portal changes, no vendor training and no API requests. If they email orders, Migme can read them.'],
];

const steps = [
  ['01', 'Connect the order inbox', 'Use the mailbox or alias where vendors already send orders. Vendor behavior stays exactly the same.'],
  ['02', 'Parse each order automatically', 'Migme reads confirmations, invoices, tables, PDFs and plain text emails as they arrive.'],
  ['03', 'Review the live dashboard', 'Orders appear with vendor, train, item, quantity, delivery details and status in a clean operating view.'],
  ['04', 'Search, flag and export', 'Find old orders, catch duplicates, review mismatches and export records whenever accounting needs them.'],
];

const faqs = [
  ['Which vendors does Migme work with?', 'Any vendor that sends orders by email. Migme is built for train food delivery order mail from platforms like Zop India, Railfood, IRCTC, Yatri Restro and similar vendors.'],
  ['Does it change how vendors send orders?', 'No. Vendors keep sending emails the way they already do. Migme works on your side by reading the connected order mailbox.'],
  ['What happens when an email format is unclear?', 'Migme flags the order for review so your team can check it. Unknown formats are not silently ignored.'],
  ['Can the team export records?', 'Yes. You can export order records by vendor, status or date range for reporting and accounting work.'],
];

export default function MigmeLandingNative({ onLogin, onSignup }) {
  const { width } = useWindowDimensions();
  const screen = useMemo(() => getScreen(width), [width]);
  const isWide = width >= 940;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <View style={[styles.header, screen.wrap]}>
          <Brand />
          <View style={styles.headerRight}>
            {isWide ? (
              <View style={styles.nav}>
                {['Overview', 'Workflow', 'Features', 'Vendors', 'FAQ'].map((item) => (
                  <Text key={item} style={styles.navText}>{item}</Text>
                ))}
              </View>
            ) : null}
            <View style={styles.headerActions}>
              <MigmeButton label="Login" onPress={onLogin} compact={!isWide} outline />
              <MigmeButton label="Signup" onPress={onSignup} compact={!isWide} />
            </View>
          </View>
        </View>

        <View style={[screen.wrap, styles.hero, isWide ? styles.heroWide : styles.heroStack]}>
          <View style={styles.heroCopy}>
            <Eyebrow>Order inbox to operating dashboard</Eyebrow>
            <Text style={[styles.display, screen.display]}>Migme keeps every train food order in one clean view.</Text>
            <Text style={[styles.lead, screen.lead]}>
              Connect the inbox your vendors already use. Migme reads order emails, extracts the details that matter and gives your team a live dashboard without manual copy-paste.
            </Text>
            <View style={styles.heroActions}>
              <MigmeButton label="Get Started Free" onPress={onSignup} large />
              <MigmeButton label="Login" onPress={onLogin} large outline />
            </View>
            <View style={styles.proofs}>
              {['Multi-vendor intake', 'Instant order parsing', 'Searchable ledger'].map((item) => (
                <Text key={item} style={styles.proof}>{item}</Text>
              ))}
            </View>
          </View>

          <FlowDiagram compact={!isWide && width < 620} />
        </View>

        <Section background="mist">
          <View style={[screen.wrap, isWide ? styles.twoCol : styles.stackGap]}>
            <View>
              <Eyebrow>What Migme does</Eyebrow>
              <Text style={[styles.h2, screen.h2]}>It turns scattered vendor emails into a dependable order desk.</Text>
            </View>
            <View style={styles.copyBlock}>
              <Text style={styles.bodyText}>
                Train food delivery teams do not need another place to manually enter orders. Migme works with the inbox already receiving order confirmations, invoices and summaries, then converts each email into structured records your team can act on.
              </Text>
              <Text style={styles.bodyText}>
                The result is a calmer day: fewer missed orders, faster checks, cleaner handoffs and a ledger that stays current as mail arrives.
              </Text>
            </View>
          </View>
        </Section>

        <Section>
          <View style={screen.wrap}>
            <Eyebrow>Workflow</Eyebrow>
            <Text style={[styles.h2, screen.h2]}>Four steps from incoming mail to a live order board.</Text>
            <View style={styles.steps}>
              {steps.map(([num, title, text]) => (
                <View key={num} style={[styles.step, screen.step]}>
                  <Text style={styles.stepNum}>{num}</Text>
                  <View style={styles.stepBody}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <Text style={styles.bodyText}>{text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Section>

        <Section background="mist">
          <View style={screen.wrap}>
            <Eyebrow>Built for daily order handling</Eyebrow>
            <Text style={[styles.h2, screen.h2]}>Everything your team needs after the email arrives.</Text>
            <View style={[styles.grid, screen.grid]}>
              {features.map(([title, text]) => (
                <View key={title} style={[styles.feature, screen.feature]}>
                  <View style={styles.featureIcon}>
                    <Text style={styles.featureIconText}>{title.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Text style={styles.smallText}>{text}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        <Section>
          <View style={[screen.wrap, isWide ? styles.twoCol : styles.stackGap]}>
            <View>
              <Eyebrow>Vendor coverage</Eyebrow>
              <Text style={[styles.h2, screen.h2]}>Works with the platforms already sending your order mail.</Text>
            </View>
            <View>
              <View style={styles.tags}>
                {vendors.map((vendor) => (
                  <Text key={vendor} style={styles.tag}>{vendor}</Text>
                ))}
              </View>
              <Text style={styles.bodyText}>
                When a new vendor format appears, Migme flags it for review instead of letting the order disappear inside the inbox.
              </Text>
            </View>
          </View>
        </Section>

        <Section>
          <View style={[screen.wrap, isWide ? styles.twoCol : styles.stackGap]}>
            <View>
              <Eyebrow>Questions</Eyebrow>
              <Text style={[styles.h2, screen.h2]}>Before you connect the order inbox.</Text>
            </View>
            <View style={styles.faqList}>
              {faqs.map(([question, answer]) => (
                <View key={question} style={styles.faqItem}>
                  <Text style={styles.cardTitle}>{question}</Text>
                  <Text style={styles.bodyText}>{answer}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        <View style={styles.cta}>
          <View style={[screen.wrap, styles.ctaInner]}>
            <Text style={styles.darkEyebrow}>Migme is ready for the inbox you already use</Text>
            <Text style={[styles.displaySmall, screen.displaySmall]}>See the day's orders without hunting through email.</Text>
            <MigmeButton label="Signup" onPress={onSignup} inverse large />
          </View>
        </View>

        <View style={[screen.wrap, styles.footer, isWide ? styles.footerWide : styles.footerStack]}>
          <View style={styles.footerBrand}>
            <Brand />
            <Text style={styles.footerText}>Train food order emails, parsed into one dashboard.</Text>
          </View>
          <View style={styles.footerLinks}>
            {['Overview', 'Workflow', 'Features', 'Vendors', 'FAQ'].map((item) => (
              <Text key={item} style={styles.footerLink}>{item}</Text>
            ))}
          </View>
          <View style={styles.footerContact}>
            <Eyebrow>Support</Eyebrow>
            <Pressable onPress={() => Linking.openURL('tel:+919175185122')}>
              <Text style={styles.phone}>+91 9175185122</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL('tel:+917627073230')}>
              <Text style={styles.phone}>+91 7627073230</Text>
            </Pressable>
          </View>
        </View>

        <View style={[screen.wrap, styles.footerBottom]}>
          <Text style={styles.footerBottomText}>Copyright 2026 Migme. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getScreen(width) {
  const small = width < 480;
  const medium = width >= 480 && width < 940;
  const columns = width >= 1040 ? 3 : width >= 680 ? 2 : 1;

  return {
    wrap: [
      styles.wrap,
      { paddingHorizontal: small ? 16 : medium ? 22 : 32 },
      width >= 1280 ? { maxWidth: 1240 } : null,
    ],
    display: {
      fontSize: small ? 34 : medium ? 46 : 64,
      lineHeight: small ? 38 : medium ? 52 : 68,
    },
    displaySmall: {
      fontSize: small ? 28 : medium ? 36 : 46,
      lineHeight: small ? 34 : medium ? 42 : 54,
    },
    h2: {
      fontSize: small ? 24 : medium ? 30 : 36,
      lineHeight: small ? 30 : medium ? 38 : 44,
    },
    lead: {
      fontSize: small ? 16 : 18,
      lineHeight: small ? 26 : 30,
    },
    grid: Platform.OS === 'web'
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : {},
    feature: {
      width: Platform.OS === 'web' ? undefined : columns === 3 ? '33.333%' : columns === 2 ? '50%' : '100%',
    },
    step: Platform.OS === 'web'
      ? { display: 'grid', gridTemplateColumns: small ? '42px 1fr' : '72px 1fr' }
      : {},
  };
}

function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>M</Text>
      </View>
      <Text style={styles.wordmark}>MIGME</Text>
    </View>
  );
}

function Eyebrow({ children }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

function MigmeButton({ label, onPress, inverse, large, compact, outline }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        compact && styles.buttonCompact,
        outline ? styles.buttonOutline : (inverse ? styles.buttonInverse : styles.buttonSolid),
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, outline ? styles.buttonTextOutline : (inverse ? styles.buttonTextInverse : styles.buttonTextSolid)]}>{label}</Text>
    </Pressable>
  );
}

function Section({ children, background }) {
  return (
    <View style={[styles.section, background === 'mist' && styles.sectionMist]}>
      {children}
    </View>
  );
}

function FlowDiagram({ compact }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const dotA = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [24, compact ? 190 : 245] }) },
      { translateY: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [86, 210, 210] }) },
    ],
  };
  const dotB = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [24, compact ? 190 : 245] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [210, 210] }) },
    ],
  };
  const dotC = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [compact ? 215 : 275, compact ? 360 : 460] }) },
      { translateY: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [210, 102, 102] }) },
    ],
  };
  const dotD = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [compact ? 215 : 275, compact ? 360 : 460] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [210, 210] }) },
    ],
  };

  return (
    <View style={[styles.flowCard, compact && styles.flowCardCompact]}>
      <View style={styles.flowTop}>
        <Text style={styles.flowTopText}>Live order flow</Text>
        <Text style={styles.flowTopText}>Inbox connected</Text>
      </View>
      <View style={[styles.flowCanvas, compact && styles.flowCanvasCompact]}>
        <FlowNode label="Vendor 1" type="mail" style={[styles.inputA, compact && styles.compactInputA]} />
        <FlowNode label="Vendor 2" type="mail" style={[styles.inputB, compact && styles.compactInputB]} />
        <FlowNode label="Vendor 3" type="mail" style={[styles.inputC, compact && styles.compactInputC]} />
        <View style={[styles.hLine, styles.lineInA, compact && styles.compactLineInA]} />
        <View style={[styles.hLine, styles.lineInB, compact && styles.compactLineInB]} />
        <View style={[styles.hLine, styles.lineOutA, compact && styles.compactLineOutA]} />
        <View style={[styles.hLine, styles.lineOutB, compact && styles.compactLineOutB]} />
        <View style={[styles.hub, compact && styles.hubCompact]}>
          <View style={styles.hubInner}>
            <Text style={styles.hubIcon}>M</Text>
          </View>
          <Text style={styles.hubText}>MIGME PARSES</Text>
        </View>
        <FlowNode label="DASHBOARD" type="panel" style={[styles.outputA, compact && styles.compactOutputA]} />
        <FlowNode label="ALERTS" type="alert" style={[styles.outputB, compact && styles.compactOutputB]} />
        <FlowNode label="LEDGER" type="ledger" style={[styles.outputC, compact && styles.compactOutputC]} />
        <Animated.View style={[styles.packet, dotA]} />
        <Animated.View style={[styles.packet, dotB]} />
        <Animated.View style={[styles.packet, dotC]} />
        <Animated.View style={[styles.packet, dotD]} />
      </View>
      <View style={styles.flowNote}>
        <View style={styles.dot} />
        <Text style={styles.flowNoteText}>Vendor emails become structured orders automatically</Text>
      </View>
    </View>
  );
}

function FlowNode({ label, type, style }) {
  return (
    <View style={[styles.flowNode, style]}>
      <View style={styles.nodeIcon}>
        {type === 'mail' ? (
          <>
            <View style={styles.mailLid} />
            <View style={styles.mailLine} />
          </>
        ) : null}
        {type === 'panel' ? (
          <View style={styles.panelLines}>
            <View style={styles.panelLine} />
            <View style={styles.panelLineShort} />
            <View style={styles.panelLine} />
          </View>
        ) : null}
        {type === 'alert' ? <Text style={styles.alertIcon}>!</Text> : null}
        {type === 'ledger' ? (
          <View style={styles.panelLines}>
            <View style={styles.panelLine} />
            <View style={styles.panelLine} />
            <View style={styles.panelLineShort} />
          </View>
        ) : null}
      </View>
      <Text style={styles.nodeLabel}>{label}</Text>
    </View>
  );
}

const shadow = Platform.select({
  web: { boxShadow: '18px 18px 0 #F0F0EE' },
  default: {
    shadowColor: colors.line,
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  page: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  pageContent: {
    paddingBottom: 0,
  },
  wrap: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  header: {
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 3,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: colors.paper,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontSize: 18,
    fontWeight: '700',
  },
  wordmark: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nav: {
    flexDirection: 'row',
    gap: 24,
  },
  navText: {
    color: colors.graphite,
    fontSize: 14,
  },
  hero: {
    paddingTop: 88,
    paddingBottom: 96,
    gap: 56,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStack: {
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1.04,
  },
  eyebrow: {
    color: colors.graphite,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  display: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontWeight: '600',
    marginBottom: 24,
    maxWidth: 780,
  },
  displaySmall: {
    color: colors.paper,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 30,
    maxWidth: 780,
  },
  h2: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontWeight: '600',
    maxWidth: 700,
  },
  lead: {
    color: colors.graphite,
    maxWidth: 620,
    marginBottom: 30,
  },
  heroActions: {
    flexDirection: 'row',
    marginBottom: 26,
    gap: 12,
    flexWrap: 'wrap',
  },
  button: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonLarge: {
    minHeight: 50,
    paddingHorizontal: 28,
  },
  buttonCompact: {
    minHeight: 40,
    paddingHorizontal: 15,
  },
  buttonSolid: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  buttonInverse: {
    backgroundColor: colors.paper,
    borderColor: colors.paper,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderColor: colors.ink,
  },
  buttonPressed: {
    opacity: .78,
  },
  buttonText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: .8,
    textTransform: 'uppercase',
  },
  buttonTextSolid: {
    color: colors.paper,
  },
  buttonTextInverse: {
    color: colors.stamp,
  },
  buttonTextOutline: {
    color: colors.ink,
  },
  proofs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  proof: {
    color: colors.graphite,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  flowCard: {
    flex: .86,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    padding: 18,
    ...shadow,
  },
  flowCardCompact: {
    width: '100%',
    padding: 14,
  },
  flowTop: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  flowTopText: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  flowCanvas: {
    height: 430,
    marginTop: 10,
    position: 'relative',
  },
  flowCanvasCompact: {
    height: 360,
  },
  flowNode: {
    position: 'absolute',
    width: 104,
    alignItems: 'center',
  },
  nodeIcon: {
    width: 88,
    height: 58,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 3,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabel: {
    color: colors.graphite,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    letterSpacing: .9,
    marginTop: 10,
  },
  inputA: { left: 0, top: 36 },
  inputB: { left: 0, top: 170 },
  inputC: { left: 0, top: 304 },
  outputA: { right: 0, top: 52 },
  outputB: { right: 0, top: 170 },
  outputC: { right: 0, top: 288 },
  compactInputA: { left: 0, top: 28 },
  compactInputB: { left: 0, top: 142 },
  compactInputC: { left: 0, top: 256 },
  compactOutputA: { right: 0, top: 34 },
  compactOutputB: { right: 0, top: 142 },
  compactOutputC: { right: 0, top: 250 },
  hLine: {
    position: 'absolute',
    height: 1,
    borderTopWidth: 2,
    borderTopColor: colors.line,
    borderStyle: 'dashed',
  },
  lineInA: { left: 104, top: 116, width: 185 },
  lineInB: { left: 104, top: 226, width: 185 },
  lineOutA: { right: 104, top: 116, width: 185 },
  lineOutB: { right: 104, top: 226, width: 185 },
  compactLineInA: { left: 98, top: 94, width: 112 },
  compactLineInB: { left: 98, top: 208, width: 112 },
  compactLineOutA: { right: 98, top: 94, width: 112 },
  compactLineOutB: { right: 98, top: 208, width: 112 },
  hub: {
    position: 'absolute',
    left: '50%',
    top: 160,
    width: 132,
    height: 132,
    marginLeft: -66,
    borderRadius: 66,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCompact: {
    top: 150,
    width: 116,
    height: 116,
    marginLeft: -58,
    borderRadius: 58,
  },
  hubInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubIcon: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontSize: 36,
    fontWeight: '700',
  },
  hubText: {
    position: 'absolute',
    bottom: -28,
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: .9,
  },
  packet: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  mailLid: {
    width: 44,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
    transform: [{ rotate: '25deg' }],
  },
  mailLine: {
    width: 42,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: colors.ink,
    transform: [{ rotate: '-25deg' }],
    marginTop: -1,
  },
  panelLines: {
    gap: 7,
  },
  panelLine: {
    width: 42,
    height: 1,
    backgroundColor: colors.ink,
  },
  panelLineShort: {
    width: 30,
    height: 1,
    backgroundColor: colors.ink,
  },
  alertIcon: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  flowNote: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  flowNoteText: {
    color: colors.graphite,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    flexShrink: 1,
  },
  section: {
    paddingVertical: 96,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  sectionMist: {
    backgroundColor: colors.mist,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 56,
    alignItems: 'flex-start',
  },
  stackGap: {
    gap: 26,
  },
  copyBlock: {
    flex: 1,
    gap: 18,
  },
  bodyText: {
    color: colors.graphite,
    fontSize: 16,
    lineHeight: 25,
  },
  smallText: {
    color: colors.graphite,
    fontSize: 15,
    lineHeight: 24,
  },
  steps: {
    marginTop: 46,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  step: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 30,
    gap: 22,
    flexDirection: Platform.OS === 'web' ? undefined : 'row',
  },
  stepNum: {
    color: colors.line,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontSize: 34,
    fontStyle: 'italic',
    lineHeight: 38,
  },
  stepBody: {
    flex: 1,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 25,
    marginBottom: 10,
  },
  grid: {
    marginTop: 46,
    display: Platform.OS === 'web' ? 'grid' : 'flex',
    flexDirection: Platform.OS === 'web' ? undefined : 'row',
    flexWrap: Platform.OS === 'web' ? undefined : 'wrap',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.line,
    gap: 1,
  },
  feature: {
    backgroundColor: colors.paper,
    padding: 30,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  featureIconText: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  tag: {
    color: colors.ink,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  faqList: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  faqItem: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 22,
  },
  cta: {
    backgroundColor: colors.stamp,
    paddingVertical: 96,
  },
  ctaInner: {
    alignItems: 'center',
  },
  darkEyebrow: {
    color: '#B9B9B4',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 58,
    paddingBottom: 50,
    gap: 36,
  },
  footerWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  footerStack: {
    flexDirection: 'column',
  },
  footerBrand: {
    maxWidth: 360,
  },
  footerText: {
    color: colors.graphite,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },
  footerLinks: {
    gap: 12,
  },
  footerLink: {
    color: colors.graphite,
    fontSize: 14,
  },
  footerContact: {
    gap: 9,
  },
  phone: {
    color: colors.ink,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 2,
  },
  footerBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 22,
  },
  footerBottomText: {
    color: colors.graphite,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
});
