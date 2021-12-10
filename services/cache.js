
const mongoose = require("mongoose");
const redis = require("redis");
const util = require("util");
const keys = require("../config/keys")

console.log("connect redis")
const client =  redis.createClient( keys.redisUrl);
client.on("error", function(error) {
    console.error(error);
  });
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function ( options = {}){
    this.useCache = true;
    this.hashKey = JSON.stringify( options.key || "");
    return this;
}

mongoose.Query.prototype.exec =async function (){
    if( !this.useCache ){
        return exec.apply(this,arguments);
    }

    // 組合query和collection name 成key 
    const key = JSON.stringify(
        Object.assign({},this.getQuery(),{
            collection: this.mongooseCollection.name
        })
    );
    // 搜尋redis key 是否已存在，存在則返回值
    const cacheValue = await client.hget(this.hashKey, key);
    if(cacheValue){
        const doc = JSON.parse(cacheValue);
        return Array.isArray(doc) 
            ? doc.map( d => new this.model(d)) 
            : new this.model(doc);
    }
  
    // 否則取出 mongoose data，並將key value存進redis
    const result = await exec.apply(this,arguments);
    client.hset(this.hashKey, key, JSON.stringify(result));
    
    return result;
};

module.exports = {
    clearHash(hashKey){
        client.del(JSON.stringify(hashKey));
    }
}