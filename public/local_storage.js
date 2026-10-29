const localSrtorage={
    items:{},
    setItem:function(key,val){this.items[key] = val;},
    getItem:function(key){return this.items[key]},
    removeItem:function(key){delete this.items[key]},
    clearItem:function(){this.items={}}
}
export default localSrtorage