import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
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
