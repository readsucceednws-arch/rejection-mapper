import { useState, useEffect } from "react";
import { useUser } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const templates = [
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    description: 'For manufacturing and production environments',
    labels: {
      zone: 'Zone',
      partNumber: 'Part Number',
      type: 'Issue Type',
      quantity: 'Quantity'
    }
  },
];

export default function TemplateSelectorFunctional() {
  const { data: user } = useUser();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState('manufacturing');
  const [isLoading, setIsLoading] = useState(false);

  // Load saved template on mount
  useEffect(() => {
    const saved = localStorage.getItem('selectedTemplate');
    if (saved) {
      setSelectedTemplate(saved);
    }
  }, []);

  const handleTemplateChange = async (templateId: string) => {
    if (!user?.organizationId) {
      toast({
        title: "Error",
        description: "You must be logged in to change templates",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Save to database
      const response = await fetch(`/api/analytics/update-template/${user.organizationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templateId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      // Save to local storage
      localStorage.setItem('selectedTemplate', templateId);
      setSelectedTemplate(templateId);

      toast({
        title: "Template Updated",
        description: `Successfully switched to ${templateId} template`,
      });

      // Reload to apply changes
      window.location.reload();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update template. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentLabels = templates.find(t => t.id === selectedTemplate)?.labels || templates[0].labels;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Industry Template</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {templates.map((template) => (
            <Button
              key={template.id}
              variant={selectedTemplate === template.id ? "default" : "outline"}
              onClick={() => handleTemplateChange(template.id)}
              disabled={isLoading}
              className="mb-2"
            >
              {template.name}
            </Button>
          ))}
        </div>
        
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Current Labels:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><strong>Zone:</strong> {currentLabels.zone}</div>
            <div><strong>Part:</strong> {currentLabels.partNumber}</div>
            <div><strong>Type:</strong> {currentLabels.type}</div>
            <div><strong>Quantity:</strong> {currentLabels.quantity}</div>
          </div>
        </div>
        
        <Badge variant="secondary" className="mt-2">
          Template: {selectedTemplate}
        </Badge>
      </CardContent>
    </Card>
  );
}
