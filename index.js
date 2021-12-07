const express = require('express')
const app = express()
const path = require('path')
const { Pool, Client } = require('pg')
const bodyParser = require('body-parser');
const passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy;
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('api', 'me', 'password', {
    dialect: 'postgres',
    port: 5432,
    host: 'localhost'
});
const bcrypt = require('bcrypt');
const session = require("express-session");
const flash = require('connect-flash');
const { nextTick } = require('process');
(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully!');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
})();
const User = sequelize.define('User', {
    login: {
        type: DataTypes.STRING,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    timestamps: false,
    tableName: 'users',
    freezeTableName: true
})
const pool = new Pool({
    user: 'me',
    host: 'localhost',
    database: 'api',
    password: 'password',
    port: 5432,
})

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true, }));
app.set('views', path.join(__dirname, '/view'));
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs');
app.use(session({ secret: "cats" }))
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

function notLoggedIn(req, res, next) {
    if (req.user) {
        res.redirect('/home');
    } else {
        next();
    }
}

function loggedIn(req, res, next) {
    if (req.user)
        next();
    else res.redirect('/login');
}
passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
    User.findByPk(id)
        .then(user => { return done(null, user.dataValues) });
});

passport.use(new LocalStrategy({
    usernameField: 'login',
    passwordField: 'password'
},
    async function (username, password, done) {
        User.findOne({ where: { login: username } })
            .then(user => {
                if (user === null)
                    return done(null, false);
                bcrypt.compare(password, user.password, (err, res) => {
                    if (err) return done(err, false);
                    if (res)
                        return done(null, user.dataValues);
                    else return done(null, false);
                })
            })
    }
));

app.post('/add', (req, res) => {
    let values = req.body;
    let table = req.body.table;
    delete values.table;
    let str = '(';
    for (value of Object.keys(values)) {
        str += value + ', ';
    }
    str = str.slice(0, -2);
    let valString = '(';
    for (value of Object.values(values)) {
        valString += "'" + value + "', ";
    }
    valString = valString.slice(0, -2);
    str += ")";
    valString += ")";
    pool
        .query(`INSERT INTO ${table} ${str} VALUES ${valString}`, (err, result) => {
            if (!err) {
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        })
})

app.post('/register', (req, res) => {
    let data = req.body;
    User.findOne({ where: { login: data.login } })
        .then(user => {
            if (user != null)
                res.sendStatus(403);
            else {
                let hashedPass = null;
                bcrypt.hash(data.pass, 10, (err, hash) => {
                    if (err) {
                        res.sendStatus(400);
                    } else {
                        hashedPass = hash;
                        User.create({ login: data.login, password: hashedPass, role: 'user' })
                            .then(() => res.sendStatus(200));
                    }
                })
            }
        })
})
app.get('/cashier', (req, res) => {
    res.render('cashier.ejs');
})

app.get('/home', loggedIn, (req, res) => {
    if (req.user.role == "admin") {
        res.redirect('/admin');
    } else {
        pool.query(`select e.id, e.name, e.city, e.dateof, s.row, s.seat, t.price from seats as s, event as e, ticket as t where s.id=t.seatid AND t.eventid=e.id and e.dateof >= CURRENT_DATE and t.userid=${req.user.id} ORDER BY e.name`, (err, result) => {
            if (result.rows)
                result.rows.map(a => a.dateof = parseDate(a.dateof));
            res.render('home.ejs', {
                user: req.user,
                tickets: result
            })
        })

    }
})

app.post('/logout', (req, res) => {
    req.logOut();
    res.sendStatus(200);
})

app.post('/checkCost', (req, res) => {
    pool.query(`SELECT price FROM seats WHERE row=${req.body.row} AND seat=${req.body.seat}`, (err, res1) => {
        let result = JSON.stringify(res1.rows[0]);
        res.end(result);
    })
})

app.post('/buy', (req, res) => {
    console.log('asd');
    console.log(req.body);
    pool.query(`INSERT INTO ticket (eventid, price, seatid, userid) VALUES ('${req.body.id}', '${req.body.price}', (SELECT id FROM seats WHERE row=${req.body.row} AND seat=${req.body.seat} LIMIT 1), ${req.body.userid})`, (err, result) => {
        res.redirect('/home');
        res.end();
    });
})

app.get('/register', notLoggedIn, (req, res) => {
    res.render('registration.ejs');
});

app.get('/login', notLoggedIn, (req, res) => {
    res.render('login.ejs', { err: req.flash("error") });

})

function parseDate(givenDate) {
    let months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
    let date = new Date(givenDate);
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

app.get('/events', loggedIn, (req, res) => {
    pool.query(`SELECT id,name,city,dateof FROM event WHERE dateof >= CURRENT_DATE ORDER BY city`, (err, result) => {
        pool.query(`SELECT id,name,city,dateof FROM event WHERE dateof < CURRENT_DATE ORDER BY city`, (error, result1) => {
            let next = result.rows;
            let previous = result1.rows;
            next.map(a => { a.dateof = parseDate(a.dateof) });
            previous.map(a => { a.dateof = parseDate(a.dateof) });
            res.render('events.ejs', {
                next: next,
                previous: previous
            })
        })
    })
})
app.post('/login',
    passport.authenticate('local', {
        successRedirect: '/home',
        failureRedirect: '/login',
        failureFlash: 'wrong login or pass'
    })
);

app.post('/cityChoose', (req, res) => {
    response = {
        resp: "MY RESPONSE",
        num: "200"
    };
    pool.query(`SELECT name, dateof FROM event WHERE dateof >= CURRENT_DATE AND city='${req.body.city}'`, (err, result) => {
        res.end(JSON.stringify(result.rows))
    })
})

app.get('/program', (req, res) => {
    if (!req.query.id)
        res.redirect('/home');
    pool.query(`select p.id, p.name, p.hourscount, p.description from program as p, event as e, eventprogram as pe where e.id=pe.eventid and p.id=pe.programid and e.id=${req.query.id}`, (err, result) => {
        pool.query(`select SUM(price) as sum, COUNT(price) as count FROM ticket WHERE eventid=${req.query.id}`, (error, result1) => {
            res.render('eventInfo.ejs', {
                data: result.rows,
                ticket: result1.rows[0]
            })
        })
    })
})

app.get('/', (req, res) => {
    res.redirect('/login');
})

app.get('/performances', (req, res) => {
    if (!req.query.id)
        res.redirect('/home');
    pool.query(`SELECT pe.id, pe.name, pe.genre, pe.minutescount FROM performance as pe, program as p, programperformance as pp WHERE p.id=pp.programid AND pp.performanceid=pe.id AND p.id=${req.query.id}`, (err, result) => {
        res.render('programInfo.ejs', {
            data: result.rows,
        })
    })
})

app.get('/performanceInfo', (req, res) => {
    if (!req.query.id)
        res.redirect('/home');
    pool.query(`SELECT w.id,w.name,w.position FROM performance as pe, worker as w, workerperformance as wp WHERE w.id=wp.workerid AND wp.performanceid=pe.id AND pe.id=${req.query.id}`, (err, result) => {
        pool.query(`SELECT a.id,a.name,a.type,a.age FROM animal as a, performance as pe, animalperformance as ap WHERE a.id=ap.animalid AND pe.id=ap.performanceid AND pe.id=${req.query.id}`, (err, result1) => {
            res.render('performanceInfo.ejs', {
                workers: result,
                animals: result1
            })
        })
    })
})

app.get('/event', loggedIn, (req, res) => {
    console.log(req.user);
    pool.query(`SELECT name, city, dateof FROM event WHERE id=${req.query.id}`, (err, result) => {
        pool.query(`SELECT seats.row, seats.seat FROM seats WHERE seats.id NOT IN (SELECT seatid FROM ticket WHERE eventid=${req.query.id})`, (err, result2) => {
            pool.query(`select e.id, e.name, e.city, e.dateof, s.row, s.seat, t.price from seats as s, event as e, ticket as t where s.id=t.seatid AND t.eventid=e.id and t.eventid=${req.query.id} and t.userid=${req.user.id} ORDER BY e.name`, (err, result3) => {
                if (result3.rows)
                    result3.rows.map(a => a.dateof = parseDate(a.dateof));
            if (result.rows)
            result.rows[0].dateof = parseDate(result.rows[0].dateof);
        res.render('event.ejs', {
            event: result.rows[0],
            id: req.query.id,
            userid: req.user.id,
            seats: result2,
            usertickets: result3
    })
})
        })
    })
})

tableNames = ['seats', 'tickettype', 'animalworker', 'animalperformance', 'programperformance', 'animal', 'event', 'ticket', 'users', 'eventprogram', 'program', 'worker', 'workerperformance', 'performance'];
rusTable = ['Место', 'Тип билета', 'Животное-Работник', 'Животное-Выступление', 'Программа-Выступление', 'Животное', 'Мероприятие', 'Билеты', 'Пользователи', 'Мероприятие-Программа', 'Программа', 'Работник', 'Работник-Выступление', 'Выступление'];
app.get('/admin', loggedIn, (req, res) => {
    if (req.user.role !== "admin")
        res.redirect('/home');
    let data = null;
    if (!req.query.table)
        req.query.table = "program";
    let rusTableName = rusTable[tableNames.indexOf(req.query.table)];

    pool.query(`SELECT table_name
    FROM information_schema.tables
   WHERE table_schema='public'
     AND table_type='BASE TABLE'`, (error, tables) => {
        pool
            .query(`SELECT * FROM ${req.query.table} order by id`, (err, result) => {
                console.log(result);

                if (!err)
                    data = result;
                res.render('admin.ejs', {
                    data: data,
                    tableName: req.query.table,
                    tables: tables.rows,
                    rusTable: rusTableName
                })
            })
    })

})

app.post('/delete', (req, res) => {
    pool.query(`DELETE FROM ${req.body.table} WHERE id=${req.body.index}`, (err, result) => {
        if (!err) {
            res.sendStatus(200);
        } else {
            res.sendStatus(400);
        }
    })
})

app.post('/edit', (req, res) => {
    let data = req.body;
    let table = req.body.table;
    let index = req.body.index;
    delete data.table;
    delete data.index;
    let str = "";
    for (let val in data) {
        str += `${val}='${data[val]}',`;
    }
    str = str.slice(0, -1);
    pool.query(`UPDATE ${table} SET ${str} WHERE id=${index}`, (err, result) => {
        if (!err) {
            res.sendStatus(200);
        } else {
            res.sendStatus(400);
        }
    })
})

app.use(function (req, res, next) {
    res.render('404.ejs');
});

app.listen(3000, () => {
    console.log("link: https://localhost:3000");
})
