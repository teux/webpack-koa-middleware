var http = require('http');
var util = require('util');
var socketio = require("socket.io");
var extend = require("extend");
var webpack = require("webpack");
var webpackDevMiddleware = require("webpack-dev-middleware");

/**
 * Mocked response
 * @param {String} url
 * @param {Function} cb Callback which is passed file content (Buffer)
 * @constructor
 */
function MockRes (url, cb) {
    this.url = url;
    this.headers = {};
    this.content = undefined;
    this.setHeader = function (name, value) {
        this.headers[name] = value;
    }.bind(this);
    this.end = function (content) {
        this.content = content;
        cb(this);
    }.bind(this);
}

/**
 * Mocked request
 * @param {String} url
 * @constructor
 */
function MockReq (url) {
    this.url = url;
}

/**
 * Sends signals and stats in socket
 * @param {WebSocket} socket
 * @param {Object} stats Webpack generated stats
 * @param {Boolean} force
 */
function sendStats(socket, stats, force) {
    if (!socket || !stats) return;
    if (!force && stats && stats.assets && stats.assets.every(function (asset) {
        return !asset.emitted;
    })) return;
    socket.emit("hash", stats.hash);
    if (stats.errors.length > 0)
        socket.emit("errors", stats.errors);
    else if (stats.warnings.length > 0)
        socket.emit("warnings", stats.warnings);
    else
        socket.emit("ok");
}

module.exports = function (cfg) {
    var indexEntry = cfg.devServer && cfg.devServer.indexEntry,
        sockets,
        stats;

    // Validate devServer config entry
    if (!(indexEntry && cfg.entry && cfg.entry[indexEntry])) {
        throw new Error('Wrong devServer parameters in webpack config');
    }
    // Configure HMR
    if (cfg.devServer.hot) {
        cfg.plugins = [new webpack.HotModuleReplacementPlugin()].concat(cfg.plugins);
        cfg.entry[indexEntry] = [
            util.format('webpack-dev-server/client?%s://%s:%s',
                cfg.devServer.secure ? 'https' : 'http',
                    cfg.devServer.host || 'localhost',
                    cfg.devServer.port || '8090'
            ),
            'webpack/hot/dev-server'
        ].concat(cfg.entry[indexEntry]);
    }

    var compiler = webpack(cfg);
    var middleware = webpackDevMiddleware(compiler, cfg.devServer);

    // Handlers for send messages to socket
    if (cfg.devServer.hot) {
        var invalidPlugin = function () {
            if (sockets) sockets.emit("invalid");
        };
        compiler.plugin("compile", invalidPlugin);
        compiler.plugin("invalid", invalidPlugin);
        compiler.plugin("done", function (compileStats) {
            stats = compileStats.toJson();
            sendStats(sockets, stats);
        });
    }

    /**
     * Calls webpack middleware in express manner.
     * @param {String} url
     * @returns {Promise}
     */
    var getAsset = function (url) {
        return new Promise(function (resolve, reject) {
            middleware(new MockReq(url), new MockRes(url, resolve), reject);
        });
    };

    /**
     * Creates sockets once, calls webpack middleware, writes asset to response.
     * @param {Function} next Next middleware.
     */
    webpackMiddleware = function* (next) {
        var server = this.req.connection.server,
            headers,
            asset;

        // hack for using with node-spdy, because I don't know
        // how to obtain server instance from request in this case
        server = server || this.app._server;

        // Create sockets once if HMR enabled
        if (!sockets && cfg.devServer.hot && server) {
            sockets = socketio.listen(server, {
                "log level": 1
            }).sockets;
            sockets.on("connection", function (socket) {
                socket.emit("hot");
                sendStats(sockets, stats, true);
            });
        }
        yield* next;
        if (this.body || this.status !== 404) return;   // response is handled

        if (asset = yield getAsset(this.url)) {
            headers = extend(asset.headers, cfg.devServer.headers);
            Object.keys(headers).forEach(function (header) {
                this.set(header, headers[header]);
            }, this);
            this.body = asset.content;
            this.status = 200;
        }
    };

    /**
     * Calls webpack for asset outside normal middleware stack.
     * @param {String} url Asset's url.
     * @returns {Promise}
     */
    webpackMiddleware.assets = function (url) {
        return getAsset(url);
    };

    return webpackMiddleware;
};
