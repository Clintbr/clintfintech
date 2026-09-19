function buildFinancialCharter() {
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `CHARTE FINANCIÈRE — CLINTFINTECH
Simulateur de réunion · Document de référence
Version alignée sur les règles du système · ${date}

═══════════════════════════════════════════════════════════════
1. OBJET ET PRINCIPES GÉNÉRAUX
═══════════════════════════════════════════════════════════════

ClintFinTech est un outil de simulation de réunion financière collective. Il modélise un fonds commun alimenté par les apports des membres, des prêts internes entre membres et le partage des intérêts selon des règles transparentes et traçables.

Principes directeurs :
• Transparence : chaque opération est consignée dans le journal chronologique.
• Proportionnalité : la propriété du capital et des flux de prêt suit les parts réelles détenues au moment des opérations.
• Équité : seuls les membres ACTIFS participent aux apports, aux prêts et aux distributions.
• Traçabilité : les tours (cycles) peuvent être réinitialisés par l’administrateur ; l’historique des indicateurs est conservé pour le suivi individuel.
• Prudence : un prêt ne peut excéder le capital disponible collectif ; les statuts inactifs excluent un membre des opérations.

Cette charte décrit les définitions, formules et règles opérationnelles telles qu’implémentées dans le simulateur. Elle sert de contrat de gouvernance pour les réunions réelles qui s’en inspirent.

═══════════════════════════════════════════════════════════════
2. ACTEURS, RÔLES ET ACCÈS
═══════════════════════════════════════════════════════════════

Administrateur (ADMIN)
• Pilote la réunion : ajout/modification des membres, apports, octroi et remboursement des prêts, réinitialisation du tour.
• Seul rôle autorisé à modifier l’état collectif de la simulation.
• Compte technique distinct des membres (non comptabilisé comme membre actif).

Membre (MEMBER)
• Consulte son espace personnel : disponible, total possédé, total dû, total contribué, prêts et journal (lecture seule).
• Peut modifier son mot de passe.
• Doit être en statut ACTIF pour se connecter et participer.

Authentification
• Connexion par identifiant et mot de passe ; session sécurisée par cookie HttpOnly.
• Compte inactif ou identifiants invalides : accès refusé.

═══════════════════════════════════════════════════════════════
3. STATUTS DES MEMBRES
═══════════════════════════════════════════════════════════════

ACTIF — Participe pleinement : apports, emprunt, financement des prêts, remboursements, indicateurs collectifs.

PARTI — Ne participe plus ; exclu des calculs de capital disponible, prêts et métriques actives.

PAUSE — Suspension temporaire ; même exclusion qu’un membre non actif.

NON VERIFIÉ — Adhésion ou dossier non validé ; exclusion des opérations jusqu’à passage en ACTIF.

Règle système : isActive = statut « ACTIF » et rôle différent de ADMIN.

═══════════════════════════════════════════════════════════════
4. DÉFINITIONS FINANCIÈRES
═══════════════════════════════════════════════════════════════

Capital total (par membre) — total_contributed : somme cumulée de tous les apports du membre depuis le début du tour.

Capital disponible (par membre) — available : portion du capital du membre non immobilisée dans des prêts en cours (liquidité immédiate).

Capital disponible collectif — somme des available de tous les membres actifs. C’est l’enveloppe maximum finançable pour de nouveaux prêts.

Prêts en cours (collectif) — valeur totale due (principal + intérêts cumulés) sur les prêts non remboursés dont l’emprunteur est actif.

Bénéfices réalisés (collectif) — somme des intérêts effectivement encaissés lors des remboursements. Le principal remboursé ne constitue pas un bénéfice.

Total dû (par membre emprunteur) — somme des montants dus (loanDue) sur ses prêts non remboursés.

Total possédé (par membre) — available + part proportionnelle de chaque prêt en cours (via loan.shares) appliquée au montant total dû de ce prêt. Reflète liquidité + créances détenues sur les emprunts du groupe.

Tour (round) — cycle de simulation ; une réinitialisation efface le journal du tour et incrémente le numéro de tour. L’administrateur choisit ensuite de remettre à zéro les indicateurs (et les prêts) ou de les conserver pour le tour suivant.

═══════════════════════════════════════════════════════════════
5. APPORTS DE CAPITAL
═══════════════════════════════════════════════════════════════

Opération : l’administrateur enregistre un apport pour un membre actif.

Effets :
• available du membre augmente du montant de l’apport.
• total_contributed du membre augmente du même montant.
• Entrée dans le journal : « [Nom] ajoute [montant] au capital. »

Contrôles :
• Montant strictement positif.
• Membre cible actif.

Interprétation financière : l’apport augmente à la fois la liquidité du membre et son engagement cumulé dans le fonds commun.

═══════════════════════════════════════════════════════════════
6. OCTROI D’UN PRÊT
═══════════════════════════════════════════════════════════════

Conditions préalables
• Emprunteur : membre actif désigné.
• Montant du prêt > 0 et ≤ capital disponible collectif.
• Capital disponible collectif > 0.

Financement proportionnel
Au moment de l’octroi, pour chaque membre actif i :
• share_i = available_i / capital_disponible_collectif
• Réduction de liquidité : available_i diminue de (available_i × montant_prêt / capital_disponible_collectif)

Les parts share_i sont enregistrées sur le prêt (loan.shares) et figent la propriété économique du principal et des intérêts jusqu’au remboursement.

Taux d’intérêt mensuel (automatique selon le montant emprunté)
• Montant < 1 000 $ : 5 % par période mensuelle
• 1 000 $ ≤ montant < 10 000 $ : 3,5 % par période mensuelle
• Montant ≥ 10 000 $ : 2,5 % par période mensuelle

Le taux appliqué est celui en vigueur à la date d’octroi et reste fixe pour la durée du prêt.

Logique économique des paliers : les petits prêts supportent un taux plus élevé (frais administratifs et risque relatifs) ; les gros montants bénéficient d’un taux réduit (effet d’échelle, incitation aux projets structurants).

═══════════════════════════════════════════════════════════════
7. CALCUL DES INTÉRÊTS ET DU MONTANT DÛ
═══════════════════════════════════════════════════════════════

Période mensuelle (loanInterestPeriods)
• À la création du prêt : au minimum 1 période d’intérêt est due (intérêt initial dès l’octroi).
• Chaque mois civil écoulé depuis la date de création peut ajouter une période.
• Règle anniversaire : si le jour du calendrier actuel est postérieur au jour de création du prêt, une période supplémentaire s’ajoute après chaque mois complet.

Intérêts cumulés
intérêts = montant × (taux / 100) × nombre_de_périodes

Montant total dû (loanDue)
montant_dû = montant_principal + intérêts_cumulés

Intérêt de base mensuel (affichage) = montant × taux / 100 (une tranche, hors cumul des périodes passées).

═══════════════════════════════════════════════════════════════
8. REMBOURSEMENT D’UN PRÊT
═══════════════════════════════════════════════════════════════

Conditions
• Prêt non déjà remboursé.
• Emprunteur encore membre actif.

Montant remboursé = montant_dû au moment du remboursement (principal restant + intérêts cumulés).

Distribution aux prêteurs (membres actifs)
Pour chaque membre i :
• available_i augmente de : montant_remboursé × share_i

Les share_i proviennent de l’enregistrement à l’octroi. Si absent (prêt ancien), repli : répartition selon total_contributed / capital total au moment du remboursement.

Effets
• Prêt marqué remboursé ; montant remboursé archivé.
• Journal : enregistrement du remboursement et du montant récupéré collectivement.

Principe : le remboursement restitue liquidité selon la propriété économique initiale du prêt ; les intérêts payés par l’emprunteur profitent aux mêmes proportions aux financeurs.

═══════════════════════════════════════════════════════════════
9. INDICATEURS DE RÉUNION ET SUIVI
═══════════════════════════════════════════════════════════════

Tableau de bord administrateur : capital total, capital disponible, prêts en cours, bénéfices réalisés, nombre de membres actifs.

Espace membre : graphique d’évolution (disponible, total possédé, total dû, total contribué) alimenté par des instantanés à chaque opération.

Journal : ordre chronologique inverse ; référence unique pour audit de réunion.

Réinitialisation du tour (administrateur, choix requis)
• Incrémente le numéro de tour.
• Efface le journal du tour en cours.
• Choix des indicateurs : remettre à zéro available et total_contributed (et effacer les prêts), ou conserver les indicateurs et les prêts pour le tour suivant.
• Nouvelle entrée de journal « Nouveau tour N » avec mention du choix effectué.

═══════════════════════════════════════════════════════════════
10. GOUVERNANCE ET BONNES PRATIQUES (RECOMMANDATIONS)
═══════════════════════════════════════════════════════════════

• Valider en réunion les statuts (ACTIF / PAUSE / PARTI) avant toute opération.
• Vérifier le capital disponible affiché avant d’accorder un prêt.
• Confirmer oralement montant, taux automatique et échéancier indicatif des intérêts mensuels.
• Conserver une exportation de la charte et du journal après chaque réunion.
• Ne pas partager les mots de passe ; les changer après la première connexion.
• En cas de litige, se référer au journal et aux parts (shares) enregistrées sur chaque prêt.

═══════════════════════════════════════════════════════════════
11. SYNTHÈSE DES FORMULES
═══════════════════════════════════════════════════════════════

Capital disponible collectif = Σ available (membres actifs)
Capital total collectif = Σ total_contributed (membres actifs)
Part de financement i = available_i / capital disponible collectif (à l’octroi)
Intérêts = principal × (taux/100) × périodes
Dû = principal + intérêts
Total possédé_i = available_i + Σ (dû_prêt × share_i_prêt)
Bénéfices réalisés = Σ (montant remboursé − principal) pour les prêts remboursés

═══════════════════════════════════════════════════════════════
12. ACCEPTATION
═══════════════════════════════════════════════════════════════

La participation à la réunion ClintFinTech implique la lecture et l’acceptation de cette charte. Toute évolution des règles doit être actée collectivement et reflétée dans une nouvelle version du document.

— Fin de la charte —
`;
}

function charterPlainText() {
  return buildFinancialCharter().replace(/\r\n/g, "\n");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function charterBodyHtml() {
  const lines = charterPlainText().split("\n");
  return lines.map(line => {
    if (line.startsWith("═")) return `<hr class="charter-rule">`;
    if (/^\d+\.\s/.test(line)) return `<h3 class="charter-section">${escapeHtml(line)}</h3>`;
    if (line.startsWith("CHARTE FINANCIÈRE") || line.startsWith("Simulateur")) {
      return `<p class="charter-lead"><strong>${escapeHtml(line)}</strong></p>`;
    }
    if (line.startsWith("•")) return `<p class="charter-bullet">${escapeHtml(line)}</p>`;
    if (!line.trim()) return "";
    return `<p>${escapeHtml(line)}</p>`;
  }).join("\n");
}

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCharterTxt() {
  downloadBlob("charte-clintfintech.txt", "text/plain;charset=utf-8", charterPlainText());
}

function exportCharterWord() {
  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Charte financière ClintFinTech</title></head><body style="font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.45;"><pre style="white-space: pre-wrap; font-family: Calibri, sans-serif;">${escapeHtml(charterPlainText())}</pre></body></html>`;
  downloadBlob("charte-clintfintech.doc", "application/msword", `\ufeff${wordHtml}`);
}

function exportCharterWhatsApp() {
  const text = charterPlainText();
  const maxUrlLength = 3500;
  const payload = text.length > maxUrlLength
    ? `${text.slice(0, maxUrlLength - 120)}\n\n[…] Texte tronqué pour WhatsApp. Exportez le fichier .txt pour la version intégrale.`
    : text;
  const url = `https://wa.me/?text=${encodeURIComponent(payload)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderCharterModalContent() {
  $("charterContent").innerHTML = charterBodyHtml();
}

function openCharterModal() {
  renderCharterModalContent();
  $("charterModal").classList.add("is-open");
  $("charterModal").setAttribute("aria-hidden", "false");
  $("charterContent").focus();
}

function closeCharterModal() {
  $("charterModal").classList.remove("is-open");
  $("charterModal").setAttribute("aria-hidden", "true");
}

function initCharterUi() {
  $("charteBtn").onclick = openCharterModal;
  document.querySelectorAll("[data-close-charter-modal]").forEach(button => {
    button.onclick = closeCharterModal;
  });
  $("exportCharterTxt").onclick = exportCharterTxt;
  $("exportCharterWord").onclick = exportCharterWord;
  $("exportCharterWhatsApp").onclick = exportCharterWhatsApp;
}
