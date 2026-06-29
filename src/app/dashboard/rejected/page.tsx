export default function RejectedPage() {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Demande refusée</h1>
          <p className="text-muted-foreground">
            Votre demande n’a pas été validée.
            Contactez le support si nécessaire.
          </p>
        </div>
      </div>
    );
  }
