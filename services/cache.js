const mongoose = require('mongoose');
const redis = require('redis');
const utils = require('util');
const keys = require('../config/keys');

const client = redis.createClient(keys.redisUrl);
client.hget = utils.promisify(client.hget);

mongoose.Query.prototype.cache = function (options = {}) {
    this.useCache = true;
    this.hashedKey = JSON.stringify(options.key || 'default');
    return this;
}

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.exec = async function () {

    if (!this.useCache) {
        return exec.apply(this, arguments);
    }

    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));

    const cachedValue = await client.hget(this.hashedKey, key);

    if (cachedValue) {
        const doc = JSON.parse(cachedValue);
        return Array.isArray(doc)
            ? doc.map(d => new this.model(d))
            : new this.model(doc);
    }

    const result = await exec.apply(this, arguments);
    client.hset(this.hashedKey, key, JSON.stringify(result));
    return result;
}

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}