import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { CloudDatabaseModel, database } from './database.js';
import { authenticateToken, valReqBody,errorHandler,checkDbOwnership } from './middleware.js';
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url';
import SqlParser from './queryParser.js';



const app = express();
const port = process.env.PORT|| 3000;
app.use(express.json())
const allowedOrigins=process.env.ALLOWED_ORIGINS?
  ALLOWED_ORIGINS.split(',').map(s=>s.trim()):[]
app.use(cors({
  origin:function(origin,callback){
    if(!origin)return callback(null,true);
    if(allowedOrigins.includes(origin)){return callback(null,true)}
    else{return callback(new Error('Diblokir CORS'))}
  },
  credentials:true,
  methods:['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders:['Content-type','Authorization']
}))
app.use(cookieParser())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.set('views',path.join(__dirname,'views'))
app.set('view engine','ejs')
app.use(express.static(path.join(__dirname, 'public')));

async function initSystemDb() {  
  try {
    const db = database('system')
    let systemDb 
    try {
      systemDb=await db.getDatabase()
    } catch (error) {
      await db.createDatabase('Admin')
      systemDb=await db.getDatabase()
      console.log('Database sistem berhasil dibuat')
    }
    try{
      const userTable=await db.getTable('user')
    }catch{
      await db.createTable('user');
    }
      await db.addCols('user',[
        {name:'id',type:'INT',req:true,uniq:true,pk:true,ai:true},
        {name:'username',type:'VARCHAR(50)',req:true,uniq:true,pk:false,ai:false},
        {name:'password',type:'TEXT',req:true,pk:false,ai:false}
      ])
    } catch (error) {
    console.error('Gagal inisiasi system DB : ')
  }
}
await initSystemDb()

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET
const REFRESH_JWT_SECRET = process.env.REFRESH_ACCESS_TOKEN


// LOGIN REGISTER TOKEN=========================================
app.post('/api/:dbName/register',valReqBody,async(req,res,next)=>{
  try {
    const {dbName}=req.params
    const {username,password}=req.body
    
    const db=database(dbName)
    const userTable=await db.getTable('user');
    const existingUser=userTable.rows.find(u=>u.username === username);
    if(existingUser)return res.status(400).json({success:false,error:`username ${username} sudah digunakan`});
    const hashedPassword=await bcrypt.hash(String(password),10);
    const newUser= await db.insert('user',{
      username:username,
      password:hashedPassword
    });
    res.status(201).json({
      success:true,
      message:'Registrasi berhasil',
      user:{id:newUser.id,username:newUser.username}
    })
  } catch (error) {
    next(error)
  }
})
app.post('/api/:dbName/login',valReqBody,async(req,res,next)=>{
  try{
    const {dbName}=req.params
    const {username,password} = req.body
    
    const db=database(dbName)
    let dbDoc = await db.getDatabase()
    const userTable =dbDoc.tables.find(t=>t.name === 'user')
    const user = userTable.rows.find(u=>u.username === username)
    if(!user){
      return res.status(400).json({success:false,error:`user ${username} tidak ketemu`})
    }
    const validPassword = await bcrypt.compare(password, user.password)
    if(!validPassword){return res.status(400).json({success:false,error:'password salah'})}
    const token = jwt.sign(
      {
        id:user.id,
        username:user.username
      },
      JWT_SECRET,
      {expiresIn:'15m'})
    const refreshToken = jwt.sign(
      {
        id:user.id,
        username:user.username
      },
      REFRESH_JWT_SECRET,
      {expiresIn:'7d'})
      await refreshTokenTable();
      dbDoc=await db.getDatabase()
      const tableRT=dbDoc.tables.find(t=>t.name === 'refresh_tokens')
      const isExist=tableRT.rows.find(r=>r.username===username)
      if(isExist)await db.delete('refresh_tokens',isExist.id);
      await db.insert('refresh_tokens',{username:user.username,token:refreshToken})

      res.cookie('refreshToken',refreshToken,{
        httpOnly:true,
        secure:true,
        sameSite:'none',
        path:'/',
        maxAge:7*24*60*60*1000
      })

      res.json({success:true,message:'berhasil',token:token})
  }catch(error){res.status(505).json({success:false,error:error.message})}
})

app.post('/api/:dbName/refresh-token',async(req,res)=>{
  const {dbName}=req.params
  const refreshToken = req.cookies.refreshToken
  if(!refreshToken)return res.status(401).json({success:false,error:'refresh cookie tidak ditemukan'});
  
  const db=database(dbName)
  const dbDoc = await db.getDatabase()
  const refreshTable = dbDoc.tables.find(t=>t.name === 'refresh_tokens') 
  const savedToken = refreshTable.rows.find(t=>t.token === refreshToken)
  if(!savedToken)return res.status(403).json({success:false,error:'refresh token tidak valid!'});
  jwt.verify(refreshToken,REFRESH_JWT_SECRET,async(error,decocedUser)=>{
    if(error){
      await db.delete('refresh_tokens',savedToken.id)
      res.clearCookie('refreshToken')
      return res.status(403).json({success:false,error:'Sesi kadaluarsa, silahkan login ulang'})
    }
    const newAccessToken = await jwt.sign(
      {id:decocedUser.id,username : decocedUser.username},
      JWT_SECRET,
      {expiresIn:'15m'}  
    )
    res.json({success:true,accessToken:newAccessToken})
  })
})
// auth===========================================================================================

// 1. GET ALL DATABASES===========================================================================
app.get('/api/databases',authenticateToken,async(req,res,next)=>{
  try {
    const currentUser=req.user.username
    const data = await CloudDatabaseModel.find({owner:currentUser})
    if(!data)return res.status(404).json({success:false,error:'Data tidak bisa ditemukan'});
    const databases=[]
    Object.values(data).map(d=>{
      const tables=[]
      Object.values(d.tables).map(t=>tables.push(t.name))
      databases.push({name:d.name,tables:tables})
  });
    return res.json({success:true,message:'Data berhasil ditemukan',data:databases})
  } catch (error) {
    next(error)
  }
})

// Belum dicheck=================
app.get('/api/db/:dbName/tables',authenticateToken,checkDbOwnership,(req,res,next)=>{
  try {
    const db = req.db;
    const table = db.getDatabase().tables;
    res.json({
      success:true,
      database:db.name,
      tables:table
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/db/:dbName/tables/:tableName',authenticateToken,checkDbOwnership,async(req,res,next)=>{
  try {
    const {tableName} = req.params;
    const dbDoc = req.dbDoc;
    const table = dbDoc.tables.find(t=>t.name === tableName);
    if(!table)return res.status(404).json({success:false,error:`Tabel ${tableName} tidak ditemukan`});
    res.json({success:true,message:`Data dari tabel ${table.name}, dengan total ${table.rows.length} `,data:{tableName:table.name,rows:table.rows}})
  } catch (error) {
    next(error)
  }
})
app.get('/api/db/:dbName/table/:tableName/search',authenticateToken,checkDbOwnership,async(req,res,next)=>{
  try{
  const {col,q}=req.query;
  const {tableName} = req.params
  const db = req.db
  const result =await db.search(tableName,q,col)
    if(!result||result.length<=0)return res.status(404).json({success:false,error:new Error('data tidak ditemukan')});
    return res.json({success:true,message:'data ditemukan',data:result})
  }catch(error){next(error)}
})

app.get('/api/db/:dbName/table/:tableName/data',authenticateToken,checkDbOwnership,(req,res,next)=>{
  const {tableName} = req.params
  const page=parseInt(req.query.page)||1
  const limit = parseInt(req.query.limit)||10
  const db = req.db
  return db.getPaginateData(tableName,page,limit)
  .then(result=>{
    if(!result)return res.status(404).json({success:false,error:'data tidak ditemukan'});
    return res.json({success:true,...result})
  })
  .catch(error=>res.status(500).json({success:false,error:error.message}))
})
// 2.POST REQUEST=================================================================================
// CREATE DATABASE
app.post('/api/databases',authenticateToken,valReqBody,async(req,res,next)=>{
    const {dbName} = req.body
    const ownerUsername = req.user.username
    if(!dbName)return res.status(400).json({success:false,error:'dbName harus diisi'});
    try{
      const db=database(dbName)
    const data = await db.createDatabase(ownerUsername)
      res.status(201).json({
        success:true,
        message:`Database ${dbName} berhasil dibuat`,
        data:data
      })
    }catch(error){next(error)}
})

app.post('/api/db/:dbName',authenticateToken,checkDbOwnership,valReqBody,(req,res,next)=>{
  const db = req.db
  const {query} = req.body
  const queryParser = new SqlParser(db)
  return queryParser.query(query)
  .then(result=>{
    if(!result)return res.status(404).json({success:false,error:`Data tidak ditemukan!`});
    return res.json({success:true,message:`Data berhasil diambil`,data:result})
  })
  .catch(error=>res.status(500).json({success:false,error:error.message}))
})

// api buat table
app.post('/api/db/:dbName/tables',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try{
    const {tableName} = req.body
    const db = req.db
    if(!tableName || tableName === undefined || tableName === null || tableName === '')throw new Error('Harus diisi');
    const table =await db.getTable(tableName) 
    if(table)return res.status(409).json({success:false,error:`tabel ${tableName} sudah ada!`})
    const data=await db.createTable(tableName)
      res.status(201).json({
        success:true,
        message:`Table ${tableName} berhasil dibuat`,
        tables:data
      })
    }
    catch(error){next(error)}
})

app.post('/api/db/dbName/table/tableName',authenticateToken,checkDbOwnership,valReqBody,async(req,res)=>{
  const {dbName,tableName} = req.params
  const {strQuery} = req.body
  console.log(strQuery)
})
// TAMBAH KOLOM============================
app.post('/api/db/:dbName/table/:tableName/cols',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try{
    const {dbName,tableName} = req.params;
    const colVal = req.body
    const db = req.db
    const data=await db.addCols(tableName,colVal)
      res.status(201).json({
        success:true,
        message:`Kolom berhasil ditambahkan ke tabel '${tableName}'`,
        data:{table:data}
      })
    }catch(error){
      next(error)
    }
})

// api tambah data (INSERT)
app.post('/api/db/:dbName/tables/:tableName',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try {
    const {tableName} = req.params;
    const db = req.db
    let object = {...req.body}
    if(object.password){
      object.password = await bcrypt.hash(object.password,10)
    }
    const inserted =await db.insert(tableName,object)
    res.status(201).json({success : true,message:'data berhasil disimpan',data : inserted})    
    } catch (error) {
      next(error)
    }
})
// UPDATE DATA======================================================
app.put('/api/db/:dbName/tables/:tableName/:id',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try {
    const {tableName,id} = req.params;
    const db = req.db;
    let updateData = {...req.body}
    if(updateData.password)updateData.password = await bcrypt.hash(String(updateData.password),10);
    const updatedRow =await db.update(tableName,id,updateData);
    res.json({success:true,message:`Data dengan id '${id}' berhasil diperbaharui`,data:updatedRow})
  } catch (error) {
    next(error);
  }
})
// DELETE BY ID=========================================================
app.delete('/api/db/:dbName/tables/:tableName/:id',authenticateToken,checkDbOwnership,async(req,res,next)=>{
  try {
    const {tableName,id} = req.params;
    const db = req.db;
    await db.delete(tableName,id);
    res.json({success:true,message:`Data dengan id '${id}' berhasil dihapus dari tabel '${tableName}'`})
  } catch (error) {
    next(error);
  }
})
app.post('/api/db/:dbName/logout',authenticateToken,checkDbOwnership,async(req,res)=>{
  const db=req.db
  const refreshToken = req.cookies.refreshToken
  if(refreshToken){
    const refreshTable = db.getTable('refresh_tokens')
    const savedToken = refreshTable.rows.find(t=>t.token === refreshToken)
    if(savedToken)db.delete('refresh_tokens',savedToken.id);
  }
  res.clearCookie('refreshToken')
  res.json({success:true,message:'Berhasil logout!'})
})

const refreshTokenTable=async()=>{
  const db=database('system')
  let dbDoc=await db.getDatabase()
    let result=dbDoc.tables.find(t=>t.name === 'refresh_tokens')
    if(!result){await db.createTable('refresh_tokens')
      await db.addCols('refresh_tokens',[
    {name:'id',type:'INT',req:true,pk:true,ai:true},
    {name:'username',type:'VARCHAR(50)',req:true},
    {name:'token',type:'TEXT',req:true}
  ])
  dbDoc =await db.getDatabase()
  result =await dbDoc.tables.find(t=>t.name === 'refresh_tokens')
}
  return result
}
app.get('/api/:dbname',(req,res,next)=>res.send('api ok'))

// VIEW ROUTES=================================================
app.get('/', (req, res) => res.render('index'));
app.get('/create', (req, res) => res.render('create'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});