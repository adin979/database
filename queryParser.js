import { database } from "./database.js"

class SqlParser{
    constructor(db){
        this.db= db
    }
    query(sqlString){
        const trimedSql = sqlString.trim().replace(/;$/,'')
        const fw= trimedSql.match(/\w+/i)
        switch(fw[0]){
            case 'SELECT':
                return this.select(trimedSql)
                break
            case 'INSERT':
                return this.insert(trimedSql)
                break
            case 'UPDATE':
                return this.update(trimedSql)
                break
            case 'DELETE':
                return this.delete(trimedSql)
                break
            case 'CREATE':
                return this.create(trimedSql)
                break
            
        }
    }

    async select(sql){
        const basePattern = /SELECT\s+(.+)\s+FROM\s+(\w+)\s+(.+)/i
        const wherePatttern = /WHERE\s+(.+?)(?=\s+ORDER BY|\s+LIMIT|\s+OFFSET|$)/i
        const limitPattern = /LIMIT\s+(\d+)/i
        const offsetPattern = /OFFSET\s+(\d+)/i
        const joinPattern = /(?:LEFT\s+|RIGHT\s+|INNER\s+)?JOIN\s+(\w+)\s+ON\s+(\S+)\s*=\s*(\S+)/i
        const orderPattern = /\s+ORDER BY\s+(\S+)(?:\s+(ASC|DESC))?/i
        const match = sql.match(basePattern)
        if(!match)throw new Error('Syntax salah!');
        const [,colStr,tableName]=match
        const dbDoc=await this.db.getDatabase()
        const t1 = dbDoc.tables.find(t=>t.name === tableName);
        if(!t1)throw new Error(`Table ${tableName} tidak ditemukan!`);
        let rows=[...t1.rows]
        if(rows.length < 1)return rows=[]
        const joinMatch=sql.trim().match(joinPattern)
        if(joinMatch){
            const [,table2,joinCol1,joinCol2]=joinMatch
            const t2 = this.db.getTable(table2)
            if(!t2)throw new Error(`Table ${table2} tidak ditemukan!`);
            const c1 = joinCol1.includes('.')?joinCol1.split('.')[1]:joinCol1
            const c2 = joinCol2.includes('.')?joinCol2.split('.')[1]:joinCol2
            let joinedRows = []
            rows.forEach(row1=>{
                t2.rows.forEach(row2=>{
                    if(String(row1[c1]) === String(row2[c2]))joinedRows.push({...row1,...row2})
                })
            })
            rows = joinedRows
        }

        const whereMatch=sql.trim().match(wherePatttern)
        if(whereMatch){
            const clause=whereMatch[1].trim()
            const conditionPattern=/(\S+)\s*(=|>|<)\s*(['"]?)([^'"]+)\3/
            const condMatch = clause.match(conditionPattern)
            if(condMatch){
                const [,colRaw,operator,rawVal] = condMatch
                const col = colRaw.includes('.')?colRaw.split('.')[1]:colRaw
                const val = !isNaN(rawVal)?Number(rawVal):rawVal
                rows = rows.filter(r=>{
                    if(operator === '=')String(r[col])===String(val);
                    if(operator === '<')String(r[col])<String(val);
                    if(operator === '>')String(r[col])>String(val);
                    return true
                })
            }
        }

        const orderMatch = sql.trim().match(orderPattern)
        if(orderMatch){
            const [,orderColRaw,orderDir]=orderMatch
            const orderCol = orderColRaw.includes('.')?orderColRaw.split('.')[1]:orderColRaw
            const isDesc = orderDir && orderDir.toUpperCase() === 'DESC'
            rows.sort((a,b)=>{
                let valA = a[orderCol]
                let valB = b[orderCol]
                if(typeof valA === 'string') valA = valA.toLocaleLowerCase();
                if(typeof valB === 'string') valB = valB.toLocaleLowerCase();
                if(valA<valB)return isDesc?1:-1
                if(valA<valB)return isDesc?-1:1
                return 0;
            })
        }
        
        const limitMatch = sql.trim().match(limitPattern)
        const offsetMatch = sql.trim().match(offsetPattern)
        const limit = limitMatch?parseInt(limitMatch[1]):rows.length;
        const offset = offsetMatch?parseInt(offsetMatch[1]):0;
        rows = rows.slice(offset,offset+limit);

        if(colStr.trim()!== '*'){
            const selectedCols=colStr.split(',').map(c=>c.trim())
            rows=rows.map(row=>{
                const filteredRow={}
                selectedCols.forEach(c=>{
                    const colName = c.includes('.')?c.split('.')[1]:c
                    if(row[colName] !== undefined){
                        filteredRow[c]=row[colName]
                    }
                })
                return filteredRow
            })
        }
        return rows
    }

    create(sql){
        const pattern=/CREATE\s+(\w+)\s+(\w+)/i
        const match = sql.match(pattern)
        if(!match)throw new Error('Syntax salah');
        const [,option,name] = match;
        switch(option){
            case 'DATABASE':
                const database = database(name)
                return database.createDb()
                break
            case 'TABLE':
                return this.db.createTable(name)
                break            
        }
    }
    insert(sql){
        const pattern = /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+)/is
        const match = sql.match(pattern)
        if(!match)throw new Error('syntax salah!');
        const [,tableName,colsStr,valuePart] = match
        const cols = colsStr.split(',').map((c)=>c.trim())
        const rowPattern = /\(([^)]+)\)/g
        let rowMatch;
        const allRecord=[]
        while((rowMatch=rowPattern.exec(valuePart)) !== null){
            const valStr = rowMatch[1]
            const vals = valStr.split(',').map((v)=>v.trim().replace(/^['"]|['"]$/g,''))
            const valRows = Array.isArray(vals)?vals:[vals]
            const newRecord = {}
            cols.forEach((col,index)=>newRecord[col] = valRows[index])
            allRecord.push(newRecord)
        }
            return this.db.insert(tableName,allRecord)
            .then(result=>result)
    }
    update(sql){
        const pattern = /UPDATE\s+(\w+)\s+SET\s+(.+)\s+WHERE\s+(.+)/i
        const match = sql.match(pattern)
        const [,tableName,columns,condition] = match
        const updateData = {}
        columns.split(',').forEach(i=>{
            const [key,val]=i.split('=').map(s=>s.trim().replace(/^['"]|['"]$/g,''))
            updateData[key]=val
        })
        const [,whereVal]=condition.split('=').map(s=>s.trim().replace(/^['"]|['"]$/g))
        return this.db.update(tableName,whereVal,updateData)
    }
    delete(sql){
        const pattern = /DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)/i
        const match = sql.match(pattern)
        const [,table,condition] = match
        const [,id]=condition.split('=').map(s=>s.trim().replace(/^['"]|['"]$/g))
        return this.db.delete(table,id)
    }
    drop(sql){
        const pattern=/DROP\s+(TABLE|DATABASE)\s+(\w+)/
        const match=sql.match(pattern)
        const [,option,name]=match
        return this.db.drop(option,name)
    }
}

export default SqlParser