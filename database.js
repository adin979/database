import mongoose from 'mongoose';

const dynamicDbSchema = new mongoose.Schema({
    name:{type:String,required:true,unique:true},
    owner:{type:String,required:true},
    tables:[
        {
            name:String,
            cols:Array,
            rows:Array
        }
    ]
},{timestamps:true})

export const CloudDatabaseModel = mongoose.model('CloudDatabase',dynamicDbSchema)

export class Database{
    constructor(name){
        this.name = name
        this.tables = []
        this.owner = null
        // this._loadFromCloud()
    }

    static async init(name){
        const db=new Database(name)
        await db._loadFromCloud()
        return db
    }

    static async createDatabase(dbName,ownerUserName){
        const existing = await CloudDatabaseModel.findOne({name:dbName});
        if(existing)throw new Error(`Database ${dbName} sudah ada!`);
        const initialData = {
            name:dbName,
            owner:ownerUserName,
            tables:[]
        }
        const newDbDoc = new CloudDatabaseModel(initialData)
        await newDbDoc.save();
        return new Database(dbName)
    }
    async createTable(tableName){
        let table = this.getTable(tableName)
        if(!table){
            table = {
                name:tableName,
                cols:[],
                rows:[]
            }
            this.tables.push(table)
            await this._autoSave()
        }
        return this
    }

    getTable(tableName){
        return this.tables.find(t=>t.name === tableName) || null
    }

    async addCols(tableName,colVal){
        const table = this.getTable(tableName)
        if(!table)throw new Error('Table '+tableName+' tidak ditemukan!')
        if(Array.isArray(colVal)){colVal.forEach(c=>{
            table.cols.push(c)
        })}else{
            table.cols.push(colVal)
        }
        await this._autoSave()
        return this
    }

    async insert(tableName,object){
     const table = this.getTable(tableName)
     if(!table) throw new Error(`Tabel ${tableName} tidak ditemukan!`);
     const allowedcols = table.cols.map(c=>c.name)

     for(const col of table.cols){
        if(col.ai){
            if(object[col.name] === undefined || object[col.name] === null || object[col.name] === ''){
                const maxId = table.rows.reduce((max,row)=>{
                    const val = Number(row[col.name])
                    return !isNaN(val) && val > max ? val : max
                },0)
                object[col.name] = maxId + 1
            }
        }
     }

     const inputKeys = Object.keys(object)
     for(const key of inputKeys){
        if(!allowedcols.includes(key))throw new Error('field belum dibuat')
     }

     for(const col of table.cols){
        const value = object[col.name]
        if((col.req || col.pk) && (value === undefined || value === null || value  === ''))throw new Error('wajib diisi');
        if(value === undefined || value === null)continue;

        const typeMatch = col.type.match(/^([A-Z]+)(?:\((\d+)\))?$/)
        const baseType = typeMatch ? typeMatch[1]:col.type
        const maxLength = typeMatch && typeMatch[2]?parseInt(typeMatch[2],10):null

        switch(baseType){
            case 'VARCHAR':
            case 'TEXT':
            case 'STRING':
                if(typeof value !== 'string')throw new Error('harus text')
                if(maxLength && value.length > maxLength)throw new Error('kepanjangan')
                break
            case 'INT':
            case 'INTEGER':
            case 'NUMBER':
                if(typeof value !== 'number'||!Number.isInteger(value))throw new Error('harus angka')
                if(maxLength && String(Math.abs(value)).length > maxLength)throw new Error('kebanyakan')
                break
            case 'BOOL':
            case 'BOOLEAN':
                if(typeof value !== 'boolean')throw new Error('harus boolean')
        }
     }
     const pkCol = table.cols.find(c=>c.pk)
     if(pkCol && !object[pkCol.name])throw new Error(`Isi primery key ${pkCol.name}`);
     table.rows.push(object)
     await this._autoSave()
     return object
    }
    search(tableName,keyword,colName=null){
        const table = this.getTable(tableName)
        if(!table)throw new Error(`Tabel ${table} tidak ditemukan`);
        const query = String(keyword).toLowerCase()
        if(colName === null){
            return table.rows.filter(r=>{
                return Object.values(r).some(v=>{
                    if(v === null || v === undefined) return false;
                    return String(v).toLowerCase().includes(query)
                })
            })
        }else{
            return table.rows.filter(r=>{
                const val = row[colName]
                if(val === null || val === undefined)return false;
                return String(val).toLowerCase().includes(query)
            })
        }
    }
    async update(tableName,fk,updateObj){
        const table = this.getTable(tableName);
        if(!table)throw new Error('Tabel tidak ditemukan');
        const pkCol = table.cols.find(c=>c.pk);
        if (!pkCol) {
            throw new Error(`Tabel '${tableName}' tidak memiliki prymery key`);
        }
        const rowIndex = table.rows.findIndex(r=>String(r[pkCol.name]) === String(fk));
        if(rowIndex === -1)throw new Error(`Data dengan ID '${fk}' tidak ditemukan`);
        delete updateObj[pkCol.name];
        table.rows[rowIndex] = {...table.rows[rowIndex],...updateObj}
        await this._autoSave()
        return table.rows[rowIndex]
    }
    async delete(tableName,fk){
        const table = this.getTable(tableName);
        if(!table)throw new Error(`Tabel '${tableName}' tidak ditemukan`);
        const pkCol = table.cols.find(c=>c.pk)
        if(!pkCol)throw new Error(`Tabel '${tableName}' tidak memiliki primery key`);
        const initialLength = table.rows.length
        table.rows = table.rows.filter(r=>String(r[pkCol.name]) !== String(fk))
        if(table.rows.length === initialLength)throw new Error(`Data dengan ID '${fk}' tidak ditemukan`);
        await this._autoSave();
        return true;
    }
    async _autoSave(){
        await CloudDatabaseModel.findOneAndUpdate(
            {name:this.name},
            {tables:this.tables},
            {returnDocument:'after',upsert:true}
        );
    }
    async _loadFromCloud(){
        const dbDoc = await CloudDatabaseModel.findOne({name:this.name})
        if(dbDoc){
            this.owner = dbDoc.owner
            this.tables = dbDoc.tables
        }
    }
}