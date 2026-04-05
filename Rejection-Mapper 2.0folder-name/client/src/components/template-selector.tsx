import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Factory,
  Cake,
  Utensils,
  Settings,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

interface Template {
  id: number;
  name: string;
  industry: string;
  description: string;
  config: {
    fieldMappings: {
      zone: string;
      partNumber: string;
      type: string;
    };
    customFields: Array<{
      name: string;
      type: string;
      required: boolean;
    }>;
  };
}

interface TemplateSelectorProps {
  organizationId: number;
  onTemplateApplied?: (config: any) => void;
}

export default function TemplateSelector({ organizationId, onTemplateApplied }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    queryFn: async () => {
      const response = await fetch("/api/templates");
      return response.json();
    },
  });

  const { data: currentConfig } = useQuery({
    queryKey: ["/api/templates/config/current"],
    queryFn: async () => {
      const response = await fetch("/api/templates/config/current");
      return response.json();
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch(`/api/templates/${templateId}/apply`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to apply template");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/config/current"] });
      setIsApplying(false);
      onTemplateApplied?.(data.config);
    },
    onError: () => {
      setIsApplying(false);
    },
  });

  const getIndustryIcon = (industry: string) => {
    switch (industry) {
      case "manufacturing":
        return <Factory className="h-6 w-6" />;
      case "bakery":
        return <Cake className="h-6 w-6" />;
      case "food_service":
        return <Utensils className="h-6 w-6" />;
      default:
        return <Settings className="h-6 w-6" />;
    }
  };

  const getIndustryColor = (industry: string) => {
    switch (industry) {
      case "manufacturing":
        return "bg-blue-100 text-blue-800";
      case "bakery":
        return "bg-orange-100 text-orange-800";
      case "food_service":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplate) return;
    
    setIsApplying(true);
    const templateId = parseInt(selectedTemplate);
    applyTemplateMutation.mutate(templateId);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Configuration */}
      {currentConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Current Configuration</span>
            </CardTitle>
            <CardDescription>
              Your organization is currently using: {currentConfig.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Zone Label</Label>
                <p className="text-sm text-gray-600">{currentConfig.fieldMappings.zone}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Item Label</Label>
                <p className="text-sm text-gray-600">{currentConfig.fieldMappings.partNumber}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Type Label</Label>
                <p className="text-sm text-gray-600">{currentConfig.fieldMappings.type}</p>
              </div>
            </div>
            {currentConfig.customFields.length > 0 && (
              <div className="mt-4">
                <Label className="text-sm font-medium">Custom Fields</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {currentConfig.customFields.map((field: any, i: number) => (
                    <Badge key={i} variant="secondary">
                      {field.name} ({field.type})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Template Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Industry Template</CardTitle>
          <CardDescription>
            Select a template to configure your organization for a specific industry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <div className="space-y-4">
              {templates?.map((template) => (
                <div key={template.id} className="flex items-start space-x-3">
                  <RadioGroupItem value={template.id.toString()} id={template.id.toString()} />
                  <div className="flex-1">
                    <Card className={`cursor-pointer transition-colors ${
                      selectedTemplate === template.id.toString() 
                        ? "ring-2 ring-blue-500" 
                        : "hover:bg-gray-50"
                    }`} onClick={() => setSelectedTemplate(template.id.toString())}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {getIndustryIcon(template.industry)}
                            <div>
                              <CardTitle className="text-lg">{template.name}</CardTitle>
                              <Badge className={getIndustryColor(template.industry)}>
                                {template.industry.replace("_", " ").toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <CardDescription>{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="text-sm">
                            <span className="font-medium">Field Labels:</span>
                            <div className="flex flex-wrap gap-4 mt-1">
                              <span>Zone: "{template.config.fieldMappings.zone}"</span>
                              <span>Item: "{template.config.fieldMappings.partNumber}"</span>
                              <span>Type: "{template.config.fieldMappings.type}"</span>
                            </div>
                          </div>
                          {template.config.customFields.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium">Custom Fields:</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {template.config.customFields.map((field, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {field.name} ({field.type})
                                    {field.required && "*"}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </RadioGroup>

          {applyTemplateMutation.error && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Failed to apply template. Please try again.
              </AlertDescription>
            </Alert>
          )}

          <Dialog>
            <DialogTrigger asChild>
              <Button 
                className="mt-6" 
                disabled={!selectedTemplate || isApplying}
              >
                {isApplying ? "Applying..." : "Apply Template"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply Template?</DialogTitle>
                <DialogDescription>
                  This will update your organization's field labels and add custom fields. 
                  This change will affect all new entries but won't modify existing data.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button onClick={handleApplyTemplate} disabled={isApplying}>
                  {isApplying ? "Applying..." : "Apply Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
