import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  AbsoluteFill,
  Easing,
} from "remotion";

// ─── Vault Onyx Colors ────────────────────────────────────────
const C = {
  surface: "#0b1326",
  surfaceLow: "#131b2e",
  surfaceContainer: "#171f33",
  surfaceHigh: "#222a3d",
  surfaceHighest: "#2d3449",
  primary: "#c3c0ff",
  primaryContainer: "#3730a3",
  secondary: "#ffb77d",
  tertiary: "#68dba9",
  tertiaryContainer: "#004d34",
  foreground: "#dae2fd",
  muted: "#c8c4d5",
  outline: "#918f9e",
};

// ─── Shared Components ────────────────────────────────────────

const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}> = ({ children, delay = 0, duration = 0.5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [delay * fps, (delay + duration) * fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const y = interpolate(
    frame,
    [delay * fps, (delay + duration) * fps],
    [30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );
  return (
    <div style={{ opacity, transform: `translateY(${y}px)` }}>{children}</div>
  );
};

const GradientButton: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryContainer})`,
      color: C.primaryContainer,
      padding: "16px 40px",
      borderRadius: 12,
      fontSize: 24,
      fontWeight: 600,
      fontFamily: "'Space Grotesk', sans-serif",
      display: "inline-block",
    }}
  >
    {text}
  </div>
);

// ─── Scene 1: Problem (0-10s) ─────────────────────────────────

const SceneProblem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lockOpacity = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  const crossOpacity = interpolate(frame, [3 * fps, 4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: C.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Lock icon fading in then getting crossed out */}
      <div style={{ position: "relative", marginBottom: 60, opacity: lockOpacity }}>
        <svg width="120" height="120" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke={C.muted}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        {/* Red cross */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 120,
            height: 120,
            opacity: crossOpacity,
          }}
        >
          <svg width="120" height="120" viewBox="0 0 120 120">
            <line x1="20" y1="20" x2="100" y2="100" stroke="#ff6b6b" strokeWidth="6" strokeLinecap="round" />
            <line x1="100" y1="20" x2="20" y2="100" stroke="#ff6b6b" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <FadeIn delay={1}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: C.foreground,
            textAlign: "center",
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          Every password manager
        </div>
      </FadeIn>
      <FadeIn delay={2}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: C.foreground,
            textAlign: "center",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          asks you to{" "}
          <span style={{ color: C.secondary }}>trust them</span>.
        </div>
      </FadeIn>
      <FadeIn delay={5}>
        <div
          style={{
            fontSize: 28,
            color: C.muted,
            marginTop: 30,
            textAlign: "center",
          }}
        >
          But what happens when they disappear?
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Solution (10-22s) ────────────────────────────────

const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${C.surface}, ${C.surfaceLow})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Shield logo */}
      <FadeIn delay={0}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: C.primaryContainer,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <svg width="40" height="40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={C.primary}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
      </FadeIn>

      <FadeIn delay={0.5}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: C.foreground,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.02em",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          Auth Box is different.
        </div>
      </FadeIn>

      <FadeIn delay={2}>
        <div
          style={{
            fontSize: 36,
            color: C.primary,
            marginTop: 20,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 500,
          }}
        >
          24 words. That's all you need.
        </div>
      </FadeIn>

      <FadeIn delay={4}>
        <div
          style={{
            fontSize: 24,
            color: C.muted,
            marginTop: 40,
            textAlign: "center",
            lineHeight: 1.8,
          }}
        >
          No email. No account. No server.
        </div>
      </FadeIn>

      {/* Seed phrase grid animation */}
      <FadeIn delay={6}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
            marginTop: 40,
            padding: "0 100px",
          }}
        >
          {[
            "abandon", "ability", "able", "about", "above", "absent",
            "absorb", "abstract", "absurd", "abuse", "access", "accident",
            "account", "accuse", "achieve", "acid", "acoustic", "acquire",
            "across", "act", "action", "actor", "actress", "actual",
          ].map((word, i) => {
            const wordOpacity = interpolate(
              frame,
              [(6 + i * 0.08) * fps, (6.3 + i * 0.08) * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <div
                key={i}
                style={{
                  background: C.surfaceHighest,
                  padding: "8px 12px",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: wordOpacity,
                }}
              >
                <span style={{ fontSize: 11, color: C.outline, fontFamily: "monospace", width: 16, textAlign: "right" }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 14, color: C.foreground, fontFamily: "monospace", fontWeight: 500 }}>
                  {word}
                </span>
              </div>
            );
          })}
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Magic (22-37s) ──────────────────────────────────

const SceneMagic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typedChars = Math.floor(
    interpolate(frame, [2 * fps, 4 * fps], [0, 10], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const siteText = "github.com".slice(0, typedChars);

  const passwordReveal = interpolate(frame, [5 * fps, 5.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: C.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <FadeIn delay={0}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: C.foreground,
            fontFamily: "'Space Grotesk', sans-serif",
            marginBottom: 50,
          }}
        >
          Passwords Without Storage
        </div>
      </FadeIn>

      {/* Derive dialog mock */}
      <FadeIn delay={1}>
        <div
          style={{
            width: 600,
            background: C.surfaceContainer,
            borderRadius: 16,
            padding: 32,
            boxShadow: "0 16px 80px rgba(55, 48, 163, 0.12)",
          }}
        >
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 8 }}>Site / Service</div>
          <div
            style={{
              background: C.surfaceHighest,
              border: `1px solid rgba(70, 69, 83, 0.2)`,
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 18,
              fontFamily: "monospace",
              color: C.foreground,
              minHeight: 28,
            }}
          >
            {siteText}
            <span style={{ opacity: frame % 30 < 15 ? 1 : 0, color: C.primary }}>|</span>
          </div>

          {/* Password result */}
          {passwordReveal > 0 && (
            <div
              style={{
                marginTop: 24,
                background: C.surfaceLow,
                borderRadius: 12,
                padding: 20,
                opacity: passwordReveal,
              }}
            >
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Derived Password</div>
              <div
                style={{
                  fontSize: 20,
                  fontFamily: "monospace",
                  color: C.foreground,
                  letterSpacing: "0.05em",
                }}
              >
                H&!LS26W,$1;8_NwrlP[
              </div>
              <div style={{ fontSize: 11, color: C.outline, marginTop: 8 }}>
                Deterministic: same seed + same site = same password. Always.
              </div>
            </div>
          )}
        </div>
      </FadeIn>

      <FadeIn delay={8}>
        <div
          style={{
            fontSize: 28,
            color: C.tertiary,
            marginTop: 40,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 600,
          }}
        >
          Your vault can be empty.
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Promise (37-50s) ─────────────────────────────────

const ScenePromise: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${C.surface}, ${C.surfaceLow})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <FadeIn delay={0}>
        <div style={{ fontSize: 24, color: C.muted, marginBottom: 20 }}>
          Even if Auth Box disappears tomorrow...
        </div>
      </FadeIn>

      <FadeIn delay={2}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: C.foreground,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.02em",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          Your 24 words
          <br />
          still unlock{" "}
          <span style={{ color: C.tertiary }}>everything</span>.
        </div>
      </FadeIn>

      <FadeIn delay={5}>
        <div
          style={{
            marginTop: 50,
            display: "flex",
            gap: 16,
          }}
        >
          {["Offline Recovery", "No Server Needed", "Open Format"].map((label) => (
            <div
              key={label}
              style={{
                background: C.tertiaryContainer,
                color: C.tertiary,
                padding: "10px 24px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Scene 5: CTA (50-60s) ─────────────────────────────────────

const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pulse effect on the shield
  const pulseScale = interpolate(
    frame % (2 * fps),
    [0, fps, 2 * fps],
    [1, 1.05, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: C.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <FadeIn delay={0}>
        <div style={{ transform: `scale(${pulseScale})`, marginBottom: 40 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: C.primaryContainer,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="50" height="50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke={C.primary}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.5}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: C.foreground,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.02em",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          Your Keys.{" "}
          <span style={{ color: C.primary }}>Your Identity.</span>
        </div>
      </FadeIn>

      <FadeIn delay={2}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: C.foreground,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          Unstoppable.
        </div>
      </FadeIn>

      <FadeIn delay={4}>
        <div style={{ marginTop: 50 }}>
          <GradientButton text="Get Started Free" />
        </div>
      </FadeIn>

      <FadeIn delay={5}>
        <div style={{ fontSize: 20, color: C.muted, marginTop: 30 }}>
          authbox.io — Open source. MIT licensed.
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

// ─── Main Composition ─────────────────────────────────────────

export const AuthBoxDemo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: C.surface }}>
      {/* Scene 1: Problem (0-10s) */}
      <Sequence from={0} durationInFrames={10 * fps} premountFor={fps}>
        <SceneProblem />
      </Sequence>

      {/* Scene 2: Solution (10-22s) */}
      <Sequence from={10 * fps} durationInFrames={12 * fps} premountFor={fps}>
        <SceneSolution />
      </Sequence>

      {/* Scene 3: Magic Moment (22-37s) */}
      <Sequence from={22 * fps} durationInFrames={15 * fps} premountFor={fps}>
        <SceneMagic />
      </Sequence>

      {/* Scene 4: The Promise (37-50s) */}
      <Sequence from={37 * fps} durationInFrames={13 * fps} premountFor={fps}>
        <ScenePromise />
      </Sequence>

      {/* Scene 5: CTA (50-60s) */}
      <Sequence from={50 * fps} durationInFrames={10 * fps} premountFor={fps}>
        <SceneCTA />
      </Sequence>
    </AbsoluteFill>
  );
};
