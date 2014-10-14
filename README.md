### For development purposes only!


# Webpack middleware for koa 

Wraps [webpack-dev-middleware](https://github.com/webpack/webpack-dev-middleware) for use in koa. Adds hot module replacement ([HMR](http://webpack.github.io/docs/hot-module-replacement-with-webpack.html)).

Webpack is the [webpack](http://webpack.github.io/) and it's module bundler.
[Koa](http://koajs.com/#request) is the next generation web framework for node.js.

# Install

`npm install webpack-koa-middleware`

# Usage

Configure and attach middleware:

```js
var middleware = require('webpack-koa-middleware');
var webpackCfg = require('webpack-cfg.js');

app.use(middleware(webpackCfg));
```
, where `app` is koa instance.

Exemple of `webpack-cfg.js` (look on `devServer` key):

```js
module.exports = {
    // Modules root directory
    context: path.join(__dirname, './app'),

    // Entry points for the build
    entry: {
        index: './index.js'     // also used in devServer config below
    },

    // Where and how to expose build results
    output: {
        publicPath: '/',        // Where bundles (build results) are served 
                                // (not path, just prefix for requests)
        filename: '[name].js',
        chunkFilename: '[name].[chunkhash].js'
    },
    
    // Development server configuration
    devServer: {
        host: process.env.USER_IP || 'localhost',
        port: 8090,
        publicPath: '/',        // Where webpack exposes bundles
                                //  on its own in-memory file system 
        hot: true,              // Switch on Hot Module Replacement
        indexEntry: 'index',    // Entry to add HNR code to (EntryChunk or CommonsChunk)
        secure: true,           // use https or http
        stats: {
            colors: true,
            hash: false,
            timings: false,
            assets: true,
            chunks: true,
            chunkModules: true,
            modules: false,
            children: true
        }
    }
}
```

For an explanation of parameters see webpack [documentation](http://webpack.github.io/docs/configuration.html).

# Explicit call

Middlewares executed in a stack-like manner upon request. Sometimes you need to
explicitly retrieve data from webpack's virtual file system.

This middleware has function `asset` which takes URL and returns promise
which is fulfilled with asset's content.

```js
var middleware = require('webpack-koa-middleware');
var webpackCfg = require('webpack-cfg.js');

middleware = middleware(webpackCfg) 
middleware.asset('/app.js')
    .then(function (content) {
        console.log(content instanceof Buffer); // => true
    });
```
