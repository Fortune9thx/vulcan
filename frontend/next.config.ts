import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  async headers() {
    // Every write in this app is a real wallet-signed transaction
    // (generate / deploy / mark_deployed) triggered from a button click --
    // frame-ancestors 'none' stops the page from being embedded in a
    // hidden/disguised iframe on another site for a clickjacking attempt
    // against those buttons. The rest are standard baseline hardening;
    // Next/Vercel set none of these by default.
    //
    // The CSP restricts script/object sources beyond just frame-ancestors --
    // there's no known injection point today (verified by two independent
    // adversarial reviews, one of which live-tested actual payloads against
    // this exact deploy), but that's exactly when defense-in-depth is worth
    // adding: it costs nothing until the day a new dangerouslySetInnerHTML
    // or unsanitized href shows up, at which point it's the difference
    // between an inert bug and a working exploit. connect-src/img-src stay
    // deliberately permissive (https:/wss: rather than an exact allowlist)
    // -- wagmi's wallet-connector stack (WalletConnect's relay, Coinbase
    // Smart Wallet, Safe) talks to a set of origins that would require
    // testing every connector live against a real wallet to enumerate
    // precisely, which isn't practical to verify here; script/object/base
    // are the directives that actually matter against XSS and stay tight.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-eval' isn't a guess -- tested against the actual
              // production build (`next build && next start`), not just
              // dev mode: without it, the client bundle throws an
              // uncaught EvalError on every single page load, meaning
              // something in the real wagmi/viem/WalletConnect stack
              // genuinely calls eval()/Function() at runtime. Blocking it
              // to chase a theoretical CSP tightening would risk silently
              // breaking real wallet functionality for a directive that
              // still blocks the one thing that actually matters here --
              // loading a *foreign* script from a different origin.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  webpack: (config) => {
    // wagmi's default connector set transitively pulls in the Coinbase
    // Base Account connector -> @coinbase/cdp-sdk -> optional @x402/*
    // payment-protocol packages that aren't installed and aren't needed --
    // VULCAN never uses x402 payments, only GenLayer contract calls.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    // @metamask/sdk's React Native storage backend and pino's optional
    // pretty-printer transport are both unreachable in a browser/Next.js
    // build -- ignore rather than leave harmless "module not found"
    // warnings in every build log.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@react-native-async-storage\/async-storage$/ })
    );
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^pino-pretty$/ }));
    return config;
  },
};

export default nextConfig;
