export default function PendingPage() {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Compte en cours de validation</h1>
          <p className="text-muted-foreground">
            Votre dossier est en cours d’examen.
            Vous recevrez un email dès validation.
          </p>
        </div>
      </div>
    );
  }
