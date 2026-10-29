import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { CloudDatabaseModel, Database } from './database.js';
import { authenticateToken, valReqBody,errorHandler,checkDbOwnership } from './middleware.js';
import cors from 'cors'
import cookieParser from 'cookie-parser'
import {connectDB} from './connection.js';
import path from 'path'
import { fileURLToPath } from 'url';
import { error } from 'console';



const app = express();
const port = process.env.PORT|| 3000;
app.use(express.json())
await connectDB()
app.use(cors({
  origin:'http://localhost:5173',
  credentials:true,
  methods:['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders:['Content-type','Authorization']
}))
app.use(cookieParser())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine','ejs')

let systemDb;
async function initSystemDb() {
  try {
    systemDb=new Database('system')
    if(typeof systemDb._loadFromCloud === 'function')await systemDb._loadFromCloud();
  } catch (error) {
    if(typeof Database.createDatabase === 'function')await Database.createDatabase('system','ADMIN')
    systemDb = new Database('system')
  }
  
  if(!systemDb.getTable('user')){
    await systemDb.createTable('user')
    await systemDb.addCols('user',[
      {name:'id',type:'INT',req:true,pk:true,ai:true},
      {name:'username',type:'VARCHAR(50)',req:true,pk:false,ai:false},
      {name:'password',type:'TEXT',req:true,pk:false,ai:false}
    ])
  }
}
await initSystemDb()

const JWT_SECRET = 'kunci_jwt'
const REFRESH_JWT_SECRET = 'kunci_jwt'
app.get('/', (req, res) => res.render('index'));
app.get('/login',(req,res)=>res.render('login'))
app.get('/register',(req,res)=>res.render('register'))

// LOGIN REGISTER TOKEN=========================================
app.post('/api/register',valReqBody,async(req,res,next)=>{
  try {
    const {username,password}=req.body
    console.log(systemDb)
    const userTable=systemDb.getTable('user');
    const existingUser=userTable.rows.find(u=>u.username === username);
    if(existingUser)return res.status(400).json({success:false,error:'username sudah digunakan'});
    const hashedPassword=await bcrypt.hash(String(password),10);
    const newUser= await systemDb.insert('user',{
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
app.post('/api/login',valReqBody,async(req,res)=>{
  const {username,password} = req.body
  const userTable = systemDb.getTable('user')
  const user = userTable.rows.find(u=>u.username === username)
  if(!user){
    return res.status(400).json({success:false,error:'user tidak ketemu',message:`userTable : ${userTable}`})
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

    const tableRT=systemDb.getTable('refresh_tokens')
    if(!tableRT)refreshTokenTable(systemDb);
    const isExist=tableRT?.rows.find(r=>r.username===username)
    if(isExist)systemDb.delete('refresh_tokens',isExist.id);

    systemDb.insert('refresh_tokens',{username:user.username,token:refreshToken})

    res.cookie('refreshToken',refreshToken,{
      httpOnly:true,
      secure:false,
      sameSite:'strict',
      maxAge:7*24*60*60*1000
    })

    res.json({success:true,message:'berhasil',token:token})
})

app.post('/api/refresh-token',(req,res)=>{
  const refreshToken = req.cookies.refreshToken
  if(!refreshToken)return res.status(401).json({success:false,error:'refresh cookie tidak ditemukan'});
  const refreshTable =systemDb.getTable('refresh_tokens')
  const savedToken = refreshTable.rows.find(t=>t.token === refreshToken)
  if(!savedToken)return res.status(403).json({success:false,error:'refresh token tidak valid!'});
  
  jwt.verify(refreshToken,REFRESH_JWT_SECRET,(error,decocedUser)=>{
    if(error){
      systemDb.delete('refresh_tokens',savedToken.id)
      res.clearCookie('refreshToken')
      return res.status(403).json({success:false,error:'Sesi kadaluarsa, silahkan login ulang'})
    }
    const newAccessToken = jwt.sign(
      {id:decocedUser.id,username : decocedUser.username},
      JWT_SECRET,
      {expiresIn:'15m'}  
    )
    res.json({success:true,accessToken:newAccessToken})
  })
})
// auth===========================================================================================

// 1. GET ALL DATABASES===========================================================================
app.get('/api/databases',authenticateToken,(req,res,next)=>{
  try {
    const currentUser=req.user.username
    CloudDatabaseModel.findOne({owner:currentUser})
    .then(data=>res.json({success:true,databases:data}))
    .catch(next)
  } catch (error) {
    
  }
})

app.get('/api/:dbName/tables',authenticateToken,checkDbOwnership,(req,res,next)=>{
  try {
    const db = req.db;
    const tableName = db.tables.map(t=>t.name);
    res.json({
      success:true,
      database:db.name,
      tables:tableName
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/:dbName/tables/:tableName',authenticateToken,checkDbOwnership,(req,res,next)=>{
  try {
    const {tableName} = req.params;
    const db = req.db;
    const table = db.getTable(tableName);
    if(!table)return res.status(404).json({success:false,error:`Tabel ${tableName} tidak ditemukan`});
    res.json({success:true,message:`data dari tabel ${table} `,table:tableName,total:table.rows.length,data:table.rows})
  } catch (error) {
    next(error)
  }
})
app.get('/api/:dbName/:tableName/search',authenticateToken,checkDbOwnership,(req,res)=>{
  const {col,q}=req.query;
  const {tableName} = req.params
  const db = req.db
  db.search(tableName,q,col)
  .then(result=>{
    if(!result||result.length===0)res.status(404).json({success:false,error:new Error('data tidak ditemukan')})
    return res.json({success:true,message:'data ditemukan',data:result})
  })
  .catch(error=>res.status(500).json({success:false,error:new Error('Kesalahan server!',error)}))
})
// 2.POST REQUEST=================================================================================
// CREATE DATABASE
app.post('/api/databases',authenticateToken,valReqBody,(req,res,next)=>{
    const {dbName} = req.body
    const ownerUsername = req.user.username
    if(!dbName)res.status(400).json({success:false,error:'dbName harus diisi'});
    Database.createDatabase(dbName,ownerUsername)
    .then(data=>{
      res.status(201).json({
        success:true,
        message:`Database ${dbName} berhasil dibuat`,
        data:data
      })
    })
    .catch(next)
})

// api buat table
app.post('/api/:dbName/tables',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try{
    const {tableName} = req.body
    const db = req.db
    if(!tableName || tableName === undefined || tableName === null || tableName === '')throw new Error('Harus diisi');
    if(db.getTable(tableName))res.status(409).json({success:false,error:`tabel ${tableName} sudah ada!`})
    const data= db.createTable(tableName)
      res.status(201).json({
        success:true,
        message:`Table ${tableName} berhasil dibuat`,
        tables:data
      })
    }
    catch(error){next(error)}
})
// TAMBAH KOLOM============================
app.post('/api/:dbName/:tableName/cols',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try{
    const {tableName} = req.params;
    const colVal = req.body
    const db = req.db
    const data=await db.addCols(tableName,colVal)
      res.status(201).json({
        success:true,
        message:`Kolom berhasil ditambahkan ke tabel '${tableName}'`,
        cols:data
      })
    }catch(error){
      next(error)
    }
})

// api tambah data
app.post('/api/:dbName/tables/:tableName',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try {
    const {tableName} = req.params;
    const db = req.db
    let object = {...req.body}
    if(object.password){
      object.password = await bcrypt.hash(object.password,10)
    }
    const inserted = db.insert(tableName,object)
    res.status(201).json({success : true,message:'data berhasil disimpan',data : inserted})    
  } catch (error) {
    next(error)
  }

})
// UPDATE DATA======================================================
app.put('/api/:dbName/tables/:tableName/:id',authenticateToken,checkDbOwnership,valReqBody,async(req,res,next)=>{
  try {
    const {tableName,id} = req.params;
    const db = req.db;
    let updateData = {...req.body}
    if(updateData.password)updateData.password = await bcrypt.hash(String(updateData.password),10);
    const updatedRow = db.update(tableName,id,updateData);
    res.json({success:true,message:`Data dengan id '${id}' berhasil diperbaharui`,data:updatedRow})
  } catch (error) {
    next(error);
  }
})
// DELETE BY ID=========================================================
app.delete('/api/:dbName/tables/:tableName/:id',authenticateToken,checkDbOwnership,(req,res,next)=>{
  try {
    const {tableName,id} = req.params;
    const db = req.db;
    db.delete(tableName,id);
    res.json({success:true,message:`Data dengan id '${id}' berhasil dihapus dari tabel '${tableName}'`})
  } catch (error) {
    next(error);
  }
})
app.post('/api/logout',(req,res)=>{
  const refreshToken = req.cookies.refreshToken
  if(refreshToken){
    const refreshTable = systemDb.getTable('refresh_tokens')
    const savedToken = refreshTable.rows.find(t=>t.token === refreshToken)
    if(savedToken)systemDb.delete('refresh_tokens',savedToken.id);
  }
  res.clearCookie('refreshToken')
  res.json({success:true,message:'Berhasil logout!'})
})

const refreshTokenTable=(systemDb)=>{
  let table=systemDb.getTable('refreshTokens')
  if(!table){
    systemDb.createTable('refresh_tokens')
    systemDb.addCols('refresh_tokens',[
        {name:'id',type:'INT',req:true,pk:true,ai:true},
        {name:'username',type:'VARCHAR(50)',req:true},
        {name:'token',type:'TEXT',req:true}
    ])
  }
}

app.use(errorHandler)

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});