import jwt from 'jsonwebtoken'
import { database } from './database.js'
const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET

export async function checkDbOwnership(req,res,next){
    try {
        const {dbName} = req.params
        const currentUser = req.user.username

        if(!dbName)return res.status(400).json({success:false,error:'Nama Database tidak valid'});
        const db= database(dbName)
        const dbDoc=await db.getDatabase()

        if(!dbDoc.owner)res.status(404).json({success:false,error:'Database tidak ditemukan!'})
        if(dbDoc.owner&&dbDoc.owner !== currentUser){
            return res.status(403).json({
                success:false,
                error:'akses ditolak'
            })
        }
        req.db = db
        req.dbDoc = dbDoc
        next()
    } catch (error) {
        return res.status(404).json({
            success:false,
            error:error.message
        })
    }
}

export function authenticateToken(req,res,next){
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(!token)return res.status(401).json({success : false,error : 'akses ditolak'});
    jwt.verify(token,JWT_SECRET,(error,user)=>{
        if(error){
            return res.status(403).json({
                success : false,
                error : 'token invalid'
            })
        }
        req.user = user
        next()
    })
}

export function valReqBody(req,res,next){
    if(!req.body || Object.keys(req.body).length === 0){
        return res.status(400).json({
            success : false,
            error : 'Data body request tidak boleh kosong'
        })
    }
    next()
}

export function errorHandler(error,req,res,next){
    console.error('Error Detected :',error.stack)
    res.status(500).json({
        success : false,
        error : error.message
    })
}
