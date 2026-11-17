import {mongoose, connectDB } from './connection.js';
import bcrypt from 'bcrypt'

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

export const CloudDatabaseModel = mongoose.models.CloudDatabase || mongoose.model('CloudDatabase', dynamicDbSchema)


export function database(dbName){
    connectDB()
    return{
        name:dbName,
        async createDatabase(ownerUserName){
            const existing = await CloudDatabaseModel.findOne({name:dbName});
            if(existing)throw new Error(`Database ${dbName} sudah ada!`);
            const initialData = {
                name:this.name,
                owner:ownerUserName,
                tables:[]
            }
            const newDbDoc = new CloudDatabaseModel(initialData)
            return await newDbDoc.save();
        },
        async getDatabase(){
            await connectDB()
            const dbDoc = await CloudDatabaseModel.findOne({name:this.name})
            if(!dbDoc)throw new Error(`Database ${this.name} tidak ditemukan`);
            return dbDoc;
        },
        async createTable(tableName){
            const dbDoc=await this.getDatabase(this.name)
            if(!dbDoc.tables)dbDoc.tables=[];
            const existingTable= dbDoc.tables.some(t=>t.name === tableName)
            if(!existingTable){
                dbDoc.tables.push({
                    name:tableName,
                    cols:[],
                    rows:[]
                })
                await dbDoc.save()
            }
            const table= dbDoc.tables.find(t=>t.name === tableName)
            return table
        },

        async getTable(tableName){
            const dbDoc=await this.getDatabase(this.name);
            return dbDoc.tables.find(t=>t.name === tableName) || null
        },

        async getPaginateData(tableName,page=1,limit=10){
            const table = this.getTable(tableName)
            if(!table||table === null)throw new Error('table tidak ditemukan!');
            const totalData = table.rows.length
            const totalPages=Math.ceil(totalData/limit)
            const activePage=Math.max(1,Math.min(page,totalPages))
            const starImdex=(activePage-1)*limit
            const endIndex=activePage*limit
            const paginatedRows=table.rows.slice(starImdex,endIndex)
            return{
                data:paginatedRows,
                pagination:{
                    currentPage:activePage,
                    totalPages:totalPages,
                    totalData:totalData,
                    limit:limit,
                    nextPage:activePage<totalPages,
                    prevPage:activePage > 1
                }
            }
        },

        async addCols(tableName,colVal){
            const dbDoc = await this.getDatabase()
            const table = dbDoc.tables.find(t=>t.name === tableName)
            if(!table)throw new Error('Table '+tableName+' tidak ditemukan!')
            if(Array.isArray(colVal)){colVal.forEach(c=>{
                table.cols.push(c)
            })}else{
                table.cols.push(colVal)
            }
            await dbDoc.save()
            return dbDoc.tables.find(t=>t.name === tableName)
        },

        async insert(tableName,inputData){
            const dbDoc=await this.getDatabase()
            const table = dbDoc.tables.find(t=>t.name===tableName)
            console.log('inputData : ',table)
            if(!table) throw new Error(`Tabel ${tableName} tidak ditemukan!`);
            const allowedcols = table.cols.map(c=>c.name)
            const objects=Array.isArray(inputData)?inputData:[inputData]
            const insertedRecord=[]
            for(const object of objects){
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
                    if(!allowedcols.includes(key))throw new Error(`field ${key} belum dibuat`)
                }

                for(const col of table.cols){
                    const value = object[col.name]
                    if(col.uniq){
                        const isExist = table.rows.find(r=>r[col.name] === value)
                        if(isExist)throw new Error(`${col.name} dengan ${value} sudah ada!`)
                    }
                    if((col.req || col.pk) && (value === undefined || value === null || value  === ''))throw new Error('Field tidak bolehkosong!');
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
                    if(col.hash)object[col.name]=await bcrypt.hash(value)
                }
                const pkCol = table.cols.find(c=>c.pk)
                if(pkCol && !object[pkCol.name])throw new Error(`Isi primery key ${pkCol.name}`);
                table.rows.push(object)
                insertedRecord.push(object)
            }
        await dbDoc.save()
        return insertedRecord
        },
        async search(tableName,keyword,colName=null){
            const table =await this.getTable(tableName)
            if(!table)throw new Error(`Tabel ${tableName} tidak ditemukan`);
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
                    const val = r[colName]
                    if(val === null || val === undefined)return false;
                    return String(val).toLowerCase().includes(query)
                })
            }
        },
        async update(tableName,fk,updateObj){
            const table =await this.getTable(tableName);
            if(!table)throw new Error('Tabel tidak ditemukan');
            const pkCol = table.cols.find(c=>c.pk);
            if (!pkCol) {
                throw new Error(`Tabel '${tableName}' tidak memiliki prymery key`);
            }
            const rowIndex = table.rows.findIndex(r=>String(r[pkCol.name]) === String(fk));
            if(rowIndex === -1)throw new Error(`Data dengan ID '${fk}' tidak ditemukan`);
            delete updateObj[pkCol.name];
            table.rows[rowIndex] = {...table.rows[rowIndex],...updateObj}
            await (this.getDatabase()).save()
            return table.rows[rowIndex]
        },
        async delete(tableName,fk){
            const dbDoc = await this.getDatabase()
            const table = dbDoc.tables.find(t=>t.name === tableName)
            if(!table)throw new Error(`Tabel '${tableName}' tidak ditemukan`);
            const pkCol = table.cols.find(c=>c.pk)
            if(!pkCol)throw new Error(`Tabel '${tableName}' tidak memiliki primery key`);
            const initialLength = table.rows.length
            table.rows = table.rows.filter(r=>String(r[pkCol.name]) !== String(fk))
            if(table.rows.length === initialLength)throw new Error(`Data dengan ID '${fk}' tidak ditemukan`);
            await dbDoc.save()
            return true;
        },
        async drop(option,name){
            switch(option){
                case 'DATABASE':
                    await CloudDatabaseModel.deleteOne({name:name})
                    break
                case 'TABLE':
                    await CloudDatabaseModel.updateOne({name:dbName},{$pull:{tables:{name:name}}});

            }
        }
    }
}