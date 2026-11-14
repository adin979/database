import HomeView from './home.js'
import create from './create.js'
import login from './login.js'
import register from './register.js'

if(location.pathname === '/create')create()
if(location.pathname === '/login')login()
if(location.pathname === '/register')register()