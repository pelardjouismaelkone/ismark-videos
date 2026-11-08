# Brancher la publication automatique gratuite (10 minutes, une seule fois)

Tu fais ces étapes **sur ordinateur**, connecté au compte Facebook qui gère la Page IsMark Digital.

## 1. Créer l'app (2 min)
1. Va sur https://developers.facebook.com/apps et clique **Créer une app**. Si on te demande de créer un compte développeur, accepte : c'est gratuit.
2. Nom de l'app : `IsMark Publisher`, puis ton email.
3. Cas d'utilisation : choisis **Autre**, puis le type **Entreprise**. Valide.

## 2. Obtenir la clé (5 min)
1. Ouvre https://developers.facebook.com/tools/explorer
2. À droite, dans **Application Meta**, choisis `IsMark Publisher`. Dans **Utilisateur ou Page**, choisis **Token utilisateur**.
3. Dans **Autorisations**, ajoute ces 8 lignes une par une :
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `business_management`
4. Clique **Generate Access Token**. Dans la fenêtre qui s'ouvre, coche ta **Page IsMark Digital** et ton **compte Instagram**, puis valide.
5. Copie le token qui apparaît, puis ouvre https://developers.facebook.com/tools/debug/accesstoken
6. Colle-le, clique **Déboguer**, puis tout en bas **Étendre le token d'accès**. Copie le nouveau token (il dure 60 jours).
7. Reviens sur l'explorateur (lien du point 1). Colle ce nouveau token dans le champ **Token d'accès**, puis tape `me/accounts` dans la barre de requête et clique **Envoyer**.
8. Dans la réponse, trouve la Page IsMark Digital et copie la longue valeur `access_token` qui est juste à côté. **C'est ta clé définitive** : elle n'expire pas.

## 3. Coller la clé dans GitHub (1 min)
1. Ouvre https://github.com/pelardjouismaelkone/ismark-videos/settings/secrets/actions/new
2. Nom : `META_PAGE_TOKEN`
3. Valeur : colle la clé de l'étape 2.8, puis clique **Add secret**.

C'est tout. Dis-moi « c'est fait » dans le fil : je lance un premier test, puis je transfère tout le planning.

**Sécurité :** ne partage cette clé avec personne, pas même dans le chat. Elle reste cachée dans GitHub.
