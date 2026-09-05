# AUDIT_FIXITNOW_MASTER.md

> Document de référence unique — PHASE 00 (audit local), généré le 05/09/2026.
> Branche : `automotive-platform` @ `da03d8a` (poussé sur origin). Typecheck et tests API verts (59/59).
> **Règle d'usage : tout prompt de développement envoyé au LLM local doit référencer ce document.**

---

## 1. État réel du dépôt (base de vérité)

- Stack actif : **Next.js 14 + Express 4 + MongoDB/Mongoose 8 + Redis (ioredis)**, monorepo npm (apps/web, apps/api, packages/types), TS strict, Zod, Jest/Vitest, Docker, GitHub Actions.
- Le dépôt contient **deux domaines** :
  - **Legacy** (home services marketplace) : models User/Category/Business/Booking/Review, controllers, routes, tests (59), frontend complet, OpenAPI, seed.
  - **Automotive** (nouveau) : 23 modèles Mongoose dans `apps/api/src/models/automotive/`, 24 modules de types dans `packages/types/src/`, module interventions complet côté API (routes/service/controller/status-history) — commité `4595d49`.
- Frontend automotive : **inexistant**. IA, matching, tracking, Stripe : **inexistants**.

## 2. Verdict par module : GARDER / MODIFIER / SUPPRIMER / CRÉER

### packages/types (`@fixitnow/types`) — GARDER, REFACTORER

- `src/legacy/*` : GARDER isolé (namespace `legacy`). Sera supprimé à terme, pas maintenant.
- `src/enums.ts` : GARDER. 19 états InterventionStatus, urgences, verification, quote, payment.
- `src/intervention*.ts`, `vehicle.ts`, `professional.ts`, `quote.ts`, `payment.ts`, `report.ts`, `verification.ts` etc. : GARDER.
- **MODIFIER (priorité 1)** : les types automotive sont des interfaces TS **sans Zod**. Rompt le principe "source unique" (les legacy sont des schemas Zod → validation + OpenAPI). Convertir progressivement en Zod schemas avec `z.infer` + `zod-to-openapi`.
- `src/index.ts` : GARDER (export namespace `legacy`).

### apps/api — socle — GARDER tel quel

- `app.ts` (helmet/cors/compression/pino/cookie), middlewares (`requestId`, `errorHandler`, `rateLimit`, `cache`, `validate`, `requireAuth`/`requireRole`), `config/*` (env, db, redis, logger), `services/tokens.ts` (JWT + allowlist Redis), `utils/AppError.ts`, `openapi.ts`.
- Auth : **GARDER**. 70 %+ réutilisable. Voir incohérence rôles ci-dessous.

### apps/api — legacy (home services) — GELER, NE PAS SUPPRIMER

- `models/{User,Category,Business,Booking,Review}.ts`, controllers/routes/tests legacy, `scripts/seed.ts`.
- Décision : **GELÉ** (aucune évolution). Suppression en fin de migration uniquement. Les tests legacy servent de filet de régression tant que `User` et l'auth sont partagés.

### apps/api — automotive — CRÉER la logique, GARDER les modèles

- Modèles existants (Vehicle, Professional, ServiceArea, Availability, Intervention, InterventionOffer, Diagnosis, Quote, QuoteItem, Payment, Invoice, Review, Conversation, Message, Notification, VerificationDocument, ProfessionalVerification, Report, Media, Skill, ProfessionalSkill, Garage, + InterventionStatusHistory) : **GARDER**, qualité bonne (index 2dsphere, invariants pre-validate, cents).
- **CRÉER** : services/contrôleurs/routes pour véhicules, professionnels, disponibilité, devis, paiements, messages, notifications, vérification ; **matching** (absent) ; **tracking** (absent).

### apps/web — REFACTORER

- 100 % legacy (recherche business, bookings, admin catégories). Geler le métier, réutiliser l'ossature : `lib/apiClient.ts`, `lib/auth-context.tsx`, `components/ui/*` (shadcn), Sentry, SEO, tests setup, AuthGate/AdminGate pattern.

## 3. Incohérences à corriger (bloquantes ou presque)

1. **Router interventions non monté** : ajouter `app.use("/interventions", interventionsRouter)` dans `app.ts` (+ tests).
2. **Rôles divergents** : `User.role` = `user|owner|admin` (legacy) vs `UserRole` = `CUSTOMER|PROFESSIONAL|ADMIN` (nouveau). `requireAuth` typé sur `legacy.UserRole`. Décision PHASE 02 : migrer User vers les nouveaux rôles, ou mapper. À trancher explicitement avant d'écrire le matching.
3. **Zod dupliqué** : `interventions.routes.ts` re-déclare les schémas (ex. enum urgence) au lieu d'importer depuis `@fixitnow/types`. Déplacer les schémas dans le package partagé.
4. **OpenAPI** : n'enregistre que les schémas legacy → les routes automotive n'apparaîtront pas dans `/api/docs` tant que les types ne sont pas en Zod.
5. **`models/index.ts` + `seed.ts`** : n'exposent que le legacy ; les modèles automotive ne sont pas ré-exportés au niveau racine ni seedés.
6. `currency` fourni par le client à la création d'intervention → forcer `EUR` côté serveur par défaut.
7. Pas de champ **contexte de lieu** (DOMICILE/PARKING/ROUTE/AUTOROUTE...) ni de statut pro `AUTHORIZED_HIGHWAY_PROVIDER` — exigence légale dépannage autoroute (tarifs réglementés).
8. CI désormais sur `automotive-platform` (commit `5e30984`) ✅.

## 4. Modèle de données cible (conforme au cahier des charges)

Entités déjà modélisées (ne pas recréer) : `User`, `Vehicle`, `Professional`, `Garage`, `ServiceArea`, `Availability`, `Skill`/`ProfessionalSkill`, `Intervention`, `InterventionStatusHistory`, `InterventionOffer`, `Diagnosis`, `Quote`/`QuoteItem`, `Payment`, `Invoice`, `Review`, `Conversation`, `Message`, `Notification`, `VerificationDocument`/`ProfessionalVerification`, `Report`, `Media`.

À créer :

- `InterventionType` (catalogue normalisé : diagnostic, batterie, freins, pneus, vidange, remorquage...) + remplacement progressif de `Intervention.services: string[]` par `interventionTypeIds: ObjectId[]` (garder le texte libre en `problem_description`).
- `MatchingCandidate` (par demande) : `requestId, providerId, score, distanceKm, etaMinutes, skillScore, availabilityScore, priceScore, ratingScore, status, expiresAt`. Score de départ : dispo 30 %, distance 20 %, compétence 20 %, prix 10 %, note 10 %, ETA 5 %, historique 5 %.
- `ProviderLocation` (tracking temps réel) : `providerId, point 2dsphere, accuracy, status, updatedAt` (collection TTL courte).
- `ProviderRealtimeStatus` : OPEN/BUSY/OFFLINE/PAUSED/ON_INTERVENTION (distinct de la dispo déclarée `Availability`).
- Enrichissements : `Intervention.locationContext` (DOMICILE|PARKING|ROUTE|ENTREPRISE|AUTOROUTE|EXPRESS), `Professional.isHighwayAuthorized`.
- `Payment` : ajouter statut AUTHORIZED (pré-autorisation Stripe) ; la séparation platformFee/professionalAmount existe déjà.

## 5. Surface API cible (routes REST)

Existante : `/auth/*`, `/categories`, `/businesses`, `/bookings`, `/reviews`, `/health`, `/api/docs`.
Créée, non montée : `/interventions` (POST, GET /mine, GET /:id, GET /:id/history).

À créer dans l'ordre des phases :

```
/vehicles                   CRUD client                                  (PHASE 02)
/provider/profile           profil pro + skills                          (PHASE 02)
/provider/availability      dispo + statut temps réel                    (PHASE 02/04)
/intervention-types         catalogue (admin)                            (PHASE 02)
/interventions/*            + PATCH statuts, actions accept/decline/
                            en-route/arrive/diagnose/complete            (PHASE 03/05)
/interventions/:id/match    moteur de matching                           (PHASE 04)
/interventions/:id/tracking position pro + ETA                           (PHASE 05)
/quotes, /quotes/:id/items  devis                                        (PHASE 06)
/payments                   Stripe + webhooks idempotents                (PHASE 07)
/conversations, /messages, /notifications                                (PHASE 08)
/provider/*                 app pro : offres, agenda, tracking           (PHASE 09)
/admin/*                    opérations : dashboard, vérifs, litiges      (PHASE 10)
/ai/*                       symptômes, estimation prix, support          (PHASE 11)
```

## 6. États métier — verrous techniques

- Machine à états `InterventionStatus` : **imposer une table de transitions autorisées** (qui peut déclencher quoi : client / pro / système) dans un module dédié (`intervention-state.ts`), appliquée dans le service, journalisée dans `InterventionStatusHistory` (fromStatus/toStatus/actor/reason). Toute transition hors table → 409.
- Devis : workflow verrouillé DIAGNOSING → QUOTE_PENDING → QUOTE_ACCEPTED → IN_PROGRESS (obligation d'information avant intervention — dépannage à domicile, Service-Public F38350).
- Autoroute : si `locationContext` ∈ {AUTOROUTE, EXPRESS} → n'autoriser que les pros `isHighwayAuthorized`, tarification réglementée distincte.
- Matching : n'enregistre des offres (`InterventionOffer`) qu'après scoring ; offre avec TTL (`expiresAt`).

## 7. Tests obligatoires (par phase)

- **Interventions (PHASE 03, immédiat)** : création (ownership du véhicule vérifié), GET /mine paginé, 404 cross-client (cloisonnement), historique trié chronologiquement, validation 400/422, rate-limit, rollback création+historique en cas d'échec.
- **Transitions d'état** : chaque transition légale OK, chaque illégale → 409 + trace dans l'historique.
- **Matching** : ordre de score déterministe, TTL d'offre, exclusions (pro non vérifié, hors rayon, indisponible).
- **Devis** : cohérence des totaux, acceptation unique, expiration.
- **Paiement** : webhook idempotent, refund partiel, répartition fee/pro exacte.
- **Multi-tenant** : un client ne voit jamais l'intervention d'un autre ; un pro non assigné non plus.
- Frontend : Vitest/RTL pour chaque nouvelle page, mocking `apiClient`.

## 8. Ordre d'exécution (phases et prompts)

> Un prompt = une phase (ou une sous-étape). Toujours : lire ce doc → code → tests verts → commit.

- **PHASE 01 — GEL ARCHITECTURAL (DÉCIDÉ)** : frontend Next.js 14 App Router ✅ / backend Express ✅ / DB MongoDB ✅ / auth JWT+Redis ✅ / payments Stripe / storage et realtime à trancher en PHASE 05. **Ne PAS migrer vers TanStack/Lovable** : le stack Express/Mongo existant est sain, testé (59/59) et déployé (Vercel/Render/Atlas/Upstash). Lovable reste optionnel pour le prototypage d'interface uniquement.
- **PHASE 02 (domain model)** : résoudre l'incohérence rôles (n°2), créer `InterventionType`, monter `/interventions` dans `app.ts` (n°1), Zod partagé (n°3), ré-exports automotive (n°5), `locationContext` (n°7).
- **PHASE 03** : tests interventions (section 7) + routes vehicles + seed automotive.
- **PHASE 04** : matching (scoring + candidats + TTL).
- **PHASE 05** : actions pro (accept/en-route/arrive/diagnose/complete), tracking temps réel, `ProviderRealtimeStatus`, décision storage/realtime.
- **PHASE 06** : quotes/quote_items API.
- **PHASE 07** : Stripe (pré-autorisation, capture, commission, refunds, webhooks idempotents).
- **PHASE 08** : conversations/messages (liés request/intervention/quote), notifications (in-app d'abord, push/SMS urgences ensuite).
- **PHASE 09** : espace pro (offres, disponibilité, tracking, documents).
- **PHASE 10** : admin opérations (dashboard temps réel, vérification pros, litiges).
- **PHASE 11** : IA (symptômes → demande structurée ; estimation prix ; matching pondéré apprenant ; détection d'anomalies ; contrôle des devis ; support client).
- **PHASE 12** : sécurité, charge, fraudes, audit, production.

## 9. Dette & hygiène (fil rouge)

- Nettoyer les BOM en tête de fichiers ; ajouter `.gitattributes` (`* text=auto eol=lf`) pour stabiliser LF/CRLF.
- Jest `--forceExit` : fermer proprement Mongo/Redis dans `afterAll`.
- README : refonte vers la plateforme automobile en PHASE 03+ ; roter les mots de passe démo publics.
- Conformité légale : infos prix/conditions avant intervention (dépannage à domicile) — le workflow devis verrouillé (section 6) couvre cette exigence.

---

_Fin du document. À mettre à jour à la fin de chaque phase (cocher les incohérences n°1–8 corrigées)._
