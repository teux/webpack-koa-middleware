var http = require('http');
var socketio = require("socket.io");
var webpack = require("webpack");
var webpackDevMiddleware = require("webpack-dev-middleware");

function sendStats(sockets, stats, force) {
    if (!sockets || !stats) return;
    if (!force && stats && stats.assets && stats.assets.every(function (asset) {
        return !asset.emitted;
    })) return;
    sockets.emit("hash", stats.hash);
    if (stats.errors.length > 0)
        sockets.emit("errors", stats.errors);
    else if (stats.warnings.length > 0)
        sockets.emit("warnings", stats.warnings);
    else
        sockets.emit("ok");
}

module.exports = function (cfg) {
    var invalidPlugin,
        indexEntry,
        middleware,
        compiler,
        sockets,
        stats;

    // Return if no index entry
    indexEntry = cfg.devServer.indexEntry;
    if (!cfg.entry[indexEntry])
        throw new Error('No entry specified or entry missing in webpack config');

    // Configure HMR
    if (cfg.devServer.hot) {
        cfg.plugins = [new webpack.HotModuleReplacementPlugin()].concat(cfg.plugins);
        cfg.entry[indexEntry] = [
            'webpack-dev-server/client?http://' +
                (cfg.devServer.host || 'localhost') + ':' +
                (cfg.devServer.port || '8090'),
            'webpack/hot/dev-server'
        ].concat(cfg.entry[indexEntry]);
    }

    // Webpack compiler and middleware
    compiler = webpack(cfg);
    middleware = webpackDevMiddleware(compiler, cfg.devServer);

    // Handlers for send messages to socket
    if (cfg.devServer.hot) {
        invalidPlugin = function () {
            if (sockets) sockets.emit("invalid");
        };
        compiler.plugin("compile", invalidPlugin);
        compiler.plugin("invalid", invalidPlugin);
        compiler.plugin("done", function (compileStats) {
            stats = compileStats.toJson();
            sendStats(sockets, stats);
        });
    }

    return function* webpack(next) {
        var ctx = this;

        // Create sockets once if HMR enabled
        if (!sockets && cfg.devServer.hot) {
            sockets = socketio.listen(ctx.req.connection.server, {
                "log level": 1
            }).sockets;
            sockets.on("connection", function (socket) {
                socket.emit("hot");
                sendStats(sockets, stats, true);
            });
        }

        yield* next;
        if (ctx.body || ctx.status !== 404) return;   // response is handled

        return yield new Promise(function (resolve) {
            // Mocked response
            var mockRes = {
                _headers: {},
                setHeader: function (name, value) {
                    mockRes._headers[name] = value;
                },
                end: function (content) {
                    Object.keys(mockRes._headers).forEach(function (key) {
                        ctx.set(key, mockRes._headers[key]);
                    });
                    ctx.body = content;
                    ctx.status = 200;
                    resolve();
                }
            };
            middleware(ctx.req, mockRes, resolve);
        }.bind(this));
    };
};
