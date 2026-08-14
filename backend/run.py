from neurodecipher_backend.runtime import app, log

if __name__ == "__main__":
    log.info("Starting NeuroDecipher modular backend.")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
