import { Card, CardContent } from "@/components/ui/card";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Em breve.
        </CardContent>
      </Card>
    </div>
  );
}