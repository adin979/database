import 'dotenv/config'
import mongoose from "mongoose"

let connectionPromise = null;

export const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(
            process.env.my_db_MONGODB_URI
        ).catch(error => {
            connectionPromise = null;
            throw error;
        });
    }

    await connectionPromise;

    console.log('MongoDB connected');

    return mongoose.connection;
};