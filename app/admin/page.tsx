"use client";
import { authClient } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import Link from "next/link";

export default function AdminPage() {

    const { data: session, isPending, error } = authClient.useSession();


    if (isPending) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    if (session === null) {
        redirect("/")
    }

    return (
        <div className="flex flex-col gap-6" >
            <div>
                <h1 className="text-4xl font-bold">Panneau d&apos;Administration</h1>
                <p className="text-default-500 mt-2">
                    Bienvenue {session.user.name}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link href="/admin/tournaments">
                    <div className="p-6 border-2 border-default-200 rounded-lg hover:border-primary cursor-pointer transition-colors">
                        <h2 className="text-xl font-semibold mb-2">Gestion des Tournois</h2>
                        <p className="text-default-500">
                            Créer et gérer les tournois TFT
                        </p>
                    </div>
                </Link>

                <div className="p-6 border-2 border-default-200 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Gestion des Joueurs</h2>
                    <p className="text-default-500">
                        Voir et modifier les profils joueurs
                    </p>
                </div>

                <div className="p-6 border-2 border-default-200 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Résultats</h2>
                    <p className="text-default-500">
                        Saisir les résultats des parties
                    </p>
                </div>

                <div className="p-6 border-2 border-default-200 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Lobbies</h2>
                    <p className="text-default-500">
                        Générer et gérer les lobbies de jeu
                    </p>
                </div>

                <div className="p-6 border-2 border-default-200 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Statistiques</h2>
                    <p className="text-default-500">
                        Voir les statistiques détaillées
                    </p>
                </div>

                <div className="p-6 border-2 border-default-200 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Paramètres</h2>
                    <p className="text-default-500">
                        Configuration du système
                    </p>
                </div>
            </div>
        </div >
    );
}
