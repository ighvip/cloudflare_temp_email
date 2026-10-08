import { createRouter, createWebHistory } from 'vue-router'
import Index from '../views/Index.vue'
import UserOauth2Callback from '../views/user/UserOauth2Callback.vue'
import i18n from '../i18n'
import { useGlobalState } from '../store'
import { getAdminPath } from '../utils'
import { setGateSession } from '../utils/gate'
import {
    DEFAULT_LOCALE,
    replaceLocaleInFullPath,
    resolveLocaleWithoutRoute,
    resolveSupportedLocale,
} from '../i18n/utils'

const { jwt, preferredLocale } = useGlobalState()

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            alias: '/:lang/',
            component: Index
        },
        {
            // 问题2: opens inside the homepage's right column
            path: '/user',
            alias: '/:lang/user',
            component: Index
        },
        {
            path: '/redeem',
            alias: '/:lang/redeem',
            component: () => import('../views/Redeem.vue')
        },
        {
            // 问题2: opens inside the homepage's right column
            path: '/help',
            alias: '/:lang/help',
            component: Index
        },
        {
            path: '/user/oauth2/callback',
            alias: '/:lang/user/oauth2/callback',
            component: UserOauth2Callback
        },
        {
            // P0-B4: server-injected admin path (ADMIN_PATH), default /admin
            path: getAdminPath(),
            alias: '/:lang' + getAdminPath(),
            component: () => import('../views/Admin.vue')
        },
        {
            path: '/telegram_mail',
            alias: '/:lang/telegram_mail',
            component: () => import('../views/telegram/Mail.vue')
        },
        {
            name: 'not-found',
            path: '/:pathMatch(.*)*',
            redirect: '/'
        }
    ]
});

router.beforeEach((to, from, next) => {
    const routeLocale = resolveSupportedLocale(to.path.split('/')[1])
    const resolvedLocale = routeLocale || resolveLocaleWithoutRoute()
    i18n.global.locale.value = resolvedLocale

    if (routeLocale) {
        // remember an explicit `/:lang/` the visitor chose, it outranks
        // the admin default on later visits
        preferredLocale.value = routeLocale
    }

    if (Object.prototype.hasOwnProperty.call(to.query, 'jwt')) {
        const jwtQuery = Array.isArray(to.query.jwt) ? to.query.jwt[0] : to.query.jwt
        if (typeof jwtQuery === 'string') {
            jwt.value = jwtQuery
        }
        const query = { ...to.query }
        delete query.jwt
        next({
            path: to.path,
            query,
            hash: to.hash,
            replace: true,
        })
        return
    }

    // P0-B4 rework: `#gt=<S>` — the session token delivered when the
    // homepage-minted `?k=` token was redeemed. Store it per-tab and KEEP
    // the fragment in the address bar so the full 64-hex token stays
    // visible/copyable (fragments are never sent to the server — 问题17).
    if (typeof to.hash === 'string' && to.hash.startsWith('#gt=')) {
        const gtHash = to.hash.slice('#gt='.length)
        if (gtHash) {
            setGateSession(gtHash)
        }
        // fall through: no redirect, the hash stays where it is
    } else if (Object.prototype.hasOwnProperty.call(to.query, 'gt')) {
        // legacy `?gt=<S>` links: store it and strip it from the URL
        const gtQuery = Array.isArray(to.query.gt) ? to.query.gt[0] : to.query.gt
        if (typeof gtQuery === 'string' && gtQuery) {
            setGateSession(gtQuery)
        }
        const query = { ...to.query }
        delete query.gt
        next({
            path: to.path,
            query,
            hash: to.hash,
            replace: true,
        })
        return
    }

    if (routeLocale) {
        const canonicalRoutePath = replaceLocaleInFullPath(to.fullPath, routeLocale)
        if (canonicalRoutePath !== to.fullPath) {
            return next(canonicalRoutePath)
        }
    }

    if (routeLocale === DEFAULT_LOCALE) {
        return next(replaceLocaleInFullPath(to.fullPath, DEFAULT_LOCALE))
    }

    next()
});

export default router
