const path = require("node:path");
const CopyPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
module.exports = async () => ({
  mode: "production",
  entry: "./dist/client-ts/main.js",
  output: {
    path: path.resolve(__dirname, "dist/client/browser"),
    filename: "app.js",
    clean: true,
  },
  resolve: {
    extensions: [".js"],
    modules: [path.resolve(__dirname, "node_modules")],
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        include: /node_modules[\\/]@angular[\\/]/,
        use: {
          loader: "babel-loader",
          options: {
            babelrc: false,
            configFile: false,
            plugins: [
              (await import("@angular/compiler-cli/linker/babel")).default,
            ],
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({ ngDevMode: "false", ngJitMode: "false" }),
    new CopyPlugin({
      patterns: [
        { from: "client/src/index.html", to: "index.html" },
        { from: "client/src/styles.css", to: "styles.css" },
      ],
    }),
  ],
  performance: { maxEntrypointSize: 650000, maxAssetSize: 650000 },
});
