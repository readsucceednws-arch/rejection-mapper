import { useState } from "react";
import { useUser } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  {
    id: 'bakery',
    name: 'Bakery',
    description: 'For bakery and food service businesses',
    labels: {
      zone: 'Kitchen Area',
      partNumber: 'Product Name',
      type: 'Quality Issue',
      quantity: 'Quantity'
    }
  }
];

export default function TemplateSelectorSimple() {
  const { data: user } = useUser();
  const [selectedTemplate, setSelectedTemplate] = useState('manufacturing');

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    // In a real implementation, this would save to user preferences
    localStorage.setItem('selectedTemplate', templateId);
  };

  const currentLabels = templates.find(t => t.id === selectedTemplate)?.labels || templates[0].labels;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Industry Template</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <Button
              key={template.id}
              variant={selectedTemplate === template.id ? "default" : "outline"}
              onClick={() => handleTemplateChange(template.id)}
              className="mb-2"
            >
              {template.name}
            </Button>
          ))}
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
